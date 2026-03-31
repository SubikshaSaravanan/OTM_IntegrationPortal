from PIL import Image, ImageDraw, ImageFont
import os

def create_invoice():
    # Create white image
    img = Image.new('RGB', (800, 800), color=(255, 255, 255))
    d = ImageDraw.Draw(img)

    # Try to load Windows fonts, otherwise fallback
    try:
        font = ImageFont.truetype("arial.ttf", 20)
        title_font = ImageFont.truetype("arialbd.ttf", 36)
        bold_font = ImageFont.truetype("arialbd.ttf", 20)
    except:
        font = ImageFont.load_default()
        title_font = ImageFont.load_default()
        bold_font = ImageFont.load_default()

    # Title
    d.text((300, 50), "INVOICE", fill=(0, 0, 0), font=title_font)
    
    # Header
    d.text((50, 150), "From:", fill=(0, 0, 0), font=bold_font)
    d.text((50, 180), "Service Provider: INTL.T1_ARFW", fill=(0, 0, 0), font=font)

    d.text((450, 150), "To:", fill=(0, 0, 0), font=bold_font)
    d.text((450, 180), "Domain: INTL", fill=(0, 0, 0), font=font)

    # Metadata
    d.text((50, 250), "Invoice Number: T1_ARFW_000005", fill=(0, 0, 0), font=font)
    d.text((50, 280), "Invoice Date: 2026-02-12 16:05:56", fill=(0, 0, 0), font=font)
    d.text((50, 310), "Currency: INR", fill=(0, 0, 0), font=font)

    # Line Items Section
    d.text((50, 380), "Line Items:", fill=(0, 0, 0), font=bold_font)
    d.line([(50, 410), (750, 410)], fill=(0,0,0), width=2)

    # Item 1
    d.text((50, 430), "1.", fill=(0, 0, 0), font=font)
    d.text((90, 430), "Ref Num: INTL.111000", fill=(0, 0, 0), font=font)
    d.text((360, 430), "Desc: B", fill=(0, 0, 0), font=font)
    d.text((460, 430), "Cost Type: B", fill=(0, 0, 0), font=font)
    d.text((630, 430), "3155.33", fill=(0, 0, 0), font=font)
    
    # Item 2
    d.text((50, 480), "2.", fill=(0, 0, 0), font=font)
    d.text((90, 480), "Ref Num: INTL.111000", fill=(0, 0, 0), font=font)
    d.text((360, 480), "Desc: A", fill=(0, 0, 0), font=font)
    d.text((460, 480), "Cost Type: A", fill=(0, 0, 0), font=font)
    d.text((650, 480), "200.00", fill=(0, 0, 0), font=font)

    d.line([(50, 540), (750, 540)], fill=(0,0,0), width=2)

    # Total
    d.text((450, 580), "Total Amount:", fill=(0, 0, 0), font=bold_font)
    d.text((620, 580), "3355.33", fill=(0, 0, 0), font=bold_font)

    # Additional Metadata for Testing
    d.text((50, 650), "Additional Info:", fill=(0, 0, 0), font=bold_font)
    d.text((50, 680), "Tax ID: GST-8877-XX", fill=(0, 0, 0), font=font)
    d.text((50, 710), "Payment Terms: Net 30 Days (Due 2026-03-14)", fill=(0, 0, 0), font=font)
    d.text((50, 740), "Notes: Please process ASAP. This is an urgent expedited shipment.", fill=(0, 0, 0), font=font)

    # Save
    output_path = r"c:\Users\subik\OneDrive\Desktop\otm-invoice-portal\sample_otm_invoice_additional.jpg"
    img.save(output_path)
    print(f"Success! Additional Invoice saved to {output_path}")

if __name__ == "__main__":
    create_invoice()
