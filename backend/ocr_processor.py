import os

try:
    import pytesseract
    from PIL import Image
except ImportError:
    pytesseract = None
    Image = None

def extract_text_from_image(image_path):
    try:
        return pytesseract.image_to_string(Image.open(image_path))
    except Exception as e:
        print(f"PyTesseract failed ({e}), falling back to Gemini OCR...")
        try:
            import google.generativeai as genai
            from dotenv import load_dotenv
            load_dotenv()
            genai.configure(api_key=os.environ.get("GOOGLE_API_KEY"))
            model = genai.GenerativeModel("gemini-2.5-flash")
            img = Image.open(image_path)
            response = model.generate_content([
                "Extract all the text tightly and exactly from this invoice document image. Leave out no text.", img
            ])
            return response.text
        except Exception as gemini_e:
            return f"OCR Image Error: {str(e)} | Gemini Fallback Error: {str(gemini_e)}"

def extract_text_from_pdf(pdf_path):
    try:
        import fitz  # PyMuPDF — lazy import
        doc = fitz.open(pdf_path)
        text = ""
        for page in doc:
            text += page.get_text()
            
        if not text.strip():
            print("PDF is scanned/empty. Using Gemini Vision OCR fallback...")
            import google.generativeai as genai
            from PIL import Image
            import io
            
            # Render first page as image
            page = doc.load_page(0)
            pix = page.get_pixmap(dpi=150)
            img = Image.open(io.BytesIO(pix.tobytes("png")))
            
            genai.configure(api_key=os.environ.get("GOOGLE_API_KEY"))
            model = genai.GenerativeModel("gemini-2.5-flash")
            response = model.generate_content([
                "Extract all the text tightly and exactly from this document image. Leave out no text.", img
            ])
            return response.text

        return text
    except ImportError:
        return f"OCR PDF Error: PyMuPDF (fitz) is not installed."
    except Exception as e:
        return f"OCR PDF Error: {str(e)}"

def parse_invoice_text(text):
    return {}
