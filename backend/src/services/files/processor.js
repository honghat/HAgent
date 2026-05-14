import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import mammoth from 'mammoth';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');
const WordExtractor = require('word-extractor');

/**
 * File Processor
 * Converts various file formats to Markdown for LLM consumption.
 */
export async function processFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  
  try {
    if (ext === '.xlsx' || ext === '.xls' || ext === '.csv') {
      return processSpreadsheet(filePath);
    } else if (ext === '.pdf') {
      return processPDF(filePath);
    } else if (ext === '.json') {
      return processJSON(filePath);
    } else if (ext === '.docx') {
      return await processDocx(filePath);
    } else if (ext === '.doc') {
      return await processDoc(filePath);
    } else if (['.txt', '.md', '.js', '.py', '.html', '.css'].includes(ext)) {
      return fs.readFileSync(filePath, 'utf8');
    }
    return `[File type ${ext} not supported for direct reading]`;
  } catch (e) {
    console.error(`[FileProcessor] Failed to process ${filePath}:`, e.message);
    return `[Error processing file: ${e.message}]`;
  }
}

function processSpreadsheet(filePath) {
  const workbook = XLSX.readFile(filePath);
  let markdown = '';
  
  workbook.SheetNames.forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    
    if (data.length > 0) {
      markdown += `### Sheet: ${sheetName}\n\n`;
      const headers = data[0];
      markdown += `| ${headers.join(' | ')} |\n`;
      markdown += `| ${headers.map(() => '---').join(' | ')} |\n`;
      
      data.slice(1, 50).forEach(row => { // Limit to 50 rows for context safety
        markdown += `| ${row.map(cell => String(cell || '')).join(' | ')} |\n`;
      });
      
      if (data.length > 50) {
        markdown += `\n*... and ${data.length - 50} more rows*\n`;
      }
      markdown += '\n';
    }
  });
  
  return markdown;
}

async function processPDF(filePath) {
  const dataBuffer = fs.readFileSync(filePath);
  const data = await pdf(dataBuffer);
  return `### PDF Content: ${path.basename(filePath)}\n\n${data.text}`;
}

function processJSON(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  try {
    const data = JSON.parse(content);
    return `### JSON Content: ${path.basename(filePath)}\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``;
  } catch {
    return content;
  }
}

async function processDocx(filePath) {
  const buffer = fs.readFileSync(filePath);
  const { value: html } = await mammoth.convertToHtml({ buffer });
  // Strip HTML tags for clean markdown-like output
  const text = html
    .replace(/<h[1-6][^>]*>/gi, '### ')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<ul[^>]*>/gi, '')
    .replace(/<\/ul>/gi, '')
    .replace(/<ol[^>]*>/gi, '')
    .replace(/<\/ol>/gi, '')
    .replace(/<strong[^>]*>/gi, '**')
    .replace(/<\/strong>/gi, '**')
    .replace(/<em[^>]*>/gi, '*')
    .replace(/<\/em>/gi, '*')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return `### Word Document: ${path.basename(filePath)}\n\n${text}`;
}

async function processDoc(filePath) {
  const extractor = new WordExtractor();
  const extracted = await extractor.extract(filePath);
  return `### Word Document: ${path.basename(filePath)}\n\n${extracted.getBody()}`;
}
