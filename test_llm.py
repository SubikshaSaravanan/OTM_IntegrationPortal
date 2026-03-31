import os
import sys

sys.path.append('backend')
from ocr_processor import extract_text_from_image
from llm_parser import parse_invoice_text_with_llm

img_path = r'c:\Users\subik\OneDrive\Desktop\otm-invoice-portal\sample_otm_invoice_additional.jpg'
print("Extracting text via OCR Processor...")
text = extract_text_from_image(img_path)
print("RAW TEXT:")
print(text)
print("-" * 50)

print("Parsing via LLM...")
import json
res = parse_invoice_text_with_llm(text)
print("JSON OUTPUT:")
print(json.dumps(res, indent=2))
