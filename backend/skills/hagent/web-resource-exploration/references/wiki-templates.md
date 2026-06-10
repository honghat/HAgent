# Wiki Entry Templates by Resource Type

## Template: HuggingFace Dataset

```markdown
Dataset URL: https://huggingface.co/datasets/<username>/<dataset_name>

## Basic Information
- **Name**: <dataset_name>
- **Creator**: @<username>
- **License**: <license_code> (e.g., cc-by-nc-4.0, MIT)
- **Languages**: <language_list>
- **Size**: <size_range> rows/files
- **Tasks**: Task 1, Task 2

## Modalities
- Document: yes/no
- Text: yes/no
- Image: yes/no
- Audio: yes/no

## Features
- <feature_description_1>
- <feature_description_2>
- OCR-analyzed: yes/no
- Structured fields: list if applicable

## Available Splits
| Split | Rows | Description |
|-------|------|-------------|
| train | <count> | Training data |
| test  | <count> | Test data (if exists) |
| eval  | <count> | Evaluation set (if exists) |

## Usage Example
```python
from datasets import load_dataset

ds = load_dataset("<username>/<dataset_name>")
print(ds)
print(ds['train'][0])  # preview first sample
```

## Links
- Dataset Card: https://huggingface.co/datasets/<username>/<dataset_name>
- Data Studio: https://huggingface.co/datasets/<username>/<dataset_name>/tree/main
- Croissant Spec: Available on HF page
- API: Available via Datasets library

---
*Source: Hugging Face - Last updated: <YYYY-MM-DD>*
```

---

## Template: GitHub Repository

```markdown
Repository URL: https://github.com/<username>/<repo_name>

## Basic Information
- **Name**: <repo_name>
- **Description**: <readme_summary>
- **Owner**: @<username>
- **License**: <license_code>
- **Stars**: <number> ⭐
- **Forks**: <number> 🍴
- **Language**: <primary_language>

## Latest Release
- **Version**: <version_number>
- **Date**: <release_date>
- **Notes**: <change_log_summary>

## Features
- <feature_1>
- <feature_2>
- <key_capability>

## Installation
```bash
pip install [<package_name>]
# or for local: git clone <repo_url> && cd <directory> && pip install .
```

## Usage Example
```python
from <import_statement> import <class_or_function>

result = <function_call>()
print(result)
```

## Links
- README: https://github.com/<username>/<repo_name>/blob/main/README.md
- API Docs: <url if available>
- GitHub Issues: https://github.com/<username>/<repo_name>/issues
- Contributing Guide: <url if available>

---
*Source: GitHub - Last updated: <YYYY-MM-DD>*
```

---

## Template: Documentation/API Reference

```markdown
Documentation URL: https://<domain>/<path_to_doc>

## Basic Information
- **Title**: <page_title>
- **Section**: <section_of_docs>
- **Last Updated**: <timestamp from footer/header>
- **Prerequisites**: <required_tools_packages>

## Purpose
Brief 1-2 sentence description of what this documentation covers.

## Key Sections
| Section | Description | URL |
|---------|-------------|-----|
| Overview | Introduction to the topic | <link> |
| Setup | Installation steps | <link> |
| API Reference | Method signatures | <link> |
| Examples | Code samples | <link> |

## Authentication
- **Type**: <api_key/oauth/jwt/none>
- **Location**: <header/query_param/body>
- **Format**: `<example_header: "Authorization: Bearer <token>"` or similar>

## Key Endpoints / Methods
| Name | Method | Description | Parameters |
|------|--------|-------------|------------|
| <endpoint_1> | GET/POST | <description> | param1, param2 |

## Usage Example
```python
# Example code from documentation
from <module> import <class_or_function>

result = <function>(arg1="<value>", arg2=42)
print(result)  # Expected output
```

## Related Documentation
- Main Index: https://<domain>/
- API Reference: https://<domain>/api-ref
- FAQ / Troubleshooting: https://<domain>/faq

---
*Source: <platform_name> - Last updated: <YYYY-MM-DD>*
```

---

## Template: General Web Resource

```markdown
Resource URL: https://<full_url>

## Basic Information
- **Title**: <page_title>
- **Description**: <main_description_from_page>
- **Source/Publisher**: <organization_or_author>
- **Date Published**: <YYYY-MM-DD or "Not specified">
- **Language**: <language_code>

## Key Content
<bullet_points_of_important_info>

## Links
- Main Page: https://<url>
- Related Resources: <list if available>
- Download/Access: <link if applicable>

---
*Source: <original_source_name> - Last updated: <YYYY-MM-DD>*
```