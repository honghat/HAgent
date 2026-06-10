# Platform-Specific Checklist for Web Resource Exploration

## HuggingFace Datasets/Models

### Essential Fields to Extract
- [ ] **Name**: Unique identifier (username/repo)
- [ ] **License**: Required (cc-by-nc-4.0, MIT, Apache 2.0, etc.)
- [ ] **Size category**: Rows count, file size, data volume
- [ ] **Languages**: Primary language(s) of content
- [ ] **Tasks**: Task types (QA, generation, classification, etc.)
- [ ] **Modalities**: Document, text, image, audio, multimodal
- [ ] **API availability**: Can load via `datasets` library?
- [ ] **Croissant spec**: Structured metadata available?

### Links to Capture
- Main dataset/model page
- Dataset card / documentation
- Data Studio (interactive explorer)
- Files & versions history
- Related resources (if linked)

### Code Snippet Template
```python
from datasets import load_dataset

ds = load_dataset("username/resource")
print(ds)  # view structure
print(ds['train'][0])  # preview first sample
```

---

## GitHub Repositories

### Essential Fields to Extract
- [ ] **Name**: username/repo
- [ ] **Description**: README summary
- [ ] **Language**: Primary programming language(s)
- [ ] **Stars/Forks**: Popularity metrics
- [ ] **License**: MIT, Apache 2.0, GPL, etc.
- [ ] **Latest release**: Version number & date
- [ ] **Installation**: pip/npm/setup.py instructions
- [ ] **Usage example**: From README

### Links to Capture
- Main repository
- README.md (full)
- API documentation (if exists)
- GitHub Discussions/Issues
- Contributing guidelines

---

## Documentation Sites (API Docs, Guides)

### Essential Fields to Extract
- [ ] **Title**: Page/document title
- [ ] **Last updated**: Timestamp in footer/header
- [ ] **Prerequisites**: Required tools, packages, permissions
- [ ] **Authentication**: API keys, OAuth, etc.
- [ ] **Key sections**: Overview, setup, examples, FAQ
- [ ] **Code examples**: From doc snippets
- [ ] **Related pages**: Nav links to other docs

### Links to Capture
- Main documentation index
- Current page URL
- API reference (if separate)
- Examples/gallery section
- Version selector (if available)

---

## General Rules for All Platforms

### Metadata Priority (in order)
1. **Name/Title** - Most critical identifier
2. **URL** - Always capture primary link
3. **License** - Legal usage terms
4. **Creator/Author** - Attribution info
5. **Size/Scope** - What's included?
6. **Language(s)** - Content language

### Usage Example Priority
1. One-line or minimal example first
2. Full example only if complex
3. Include imports needed
4. Add brief explanation below code

### Common Pitfalls Checklist
- [ ] Checked for version selectors (use latest)
- [ ] Verified license compatibility
- [ ] Noted authentication requirements
- [ ] Captured all main page links
- [ ] Read README/DOC card (not just homepage)
- [ ] Checked download/API availability