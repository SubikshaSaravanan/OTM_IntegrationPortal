import os
import json
import typing
import google.generativeai as genai
from pydantic import BaseModel, Field
from dotenv import load_dotenv

load_dotenv()


# Ensure you have your GOOGLE_API_KEY set in the environment
# e.g., in your .env: GOOGLE_API_KEY=your_gemini_api_key
genai.configure(api_key=os.environ.get("GOOGLE_API_KEY"))

# Define the precise schema for our LLM output using Pydantic
class LineItemSchema(BaseModel):
    shipmentGid: str = Field(description="The shipment ID, cost reference, or INTL number (e.g., INTL.111000).")
    costTypeGid: str = Field(description="The cost type. B or BASE for base charges, A or Accessorial for accessorial charges.")
    amount: str = Field(description="The numeric amount of the line item charge, format as string or number without currency symbol.")

class MetadataItem(BaseModel):
    key: str = Field(description="Name of the extra field (e.g. 'Tax ID', 'Due Date', 'Payment Terms', 'Notes').")
    value: str = Field(description="Extracted value for this field.")

class InvoiceSchema(BaseModel):
    invoiceNumber: str = Field(description="The invoice number, bill number, or reference number of the invoice.")
    invoiceDate: str = Field(description="The text date of the invoice issuance (e.g., 2026-02-12 or 12 Feb 2026).")
    serviceProvider: str = Field(description="The carrier, transporter, vendor, or service provider name.")
    currencyGid: str = Field(description="The 3-letter currency code (e.g. INR, USD, EUR).")
    amount: str = Field(description="Total amount of the invoice.")
    items: typing.List[LineItemSchema] = Field(description="List of extracted line items and their corresponding shipments and amounts.")
    additionalMetadata: typing.List[MetadataItem] = Field(description="List of any extra fields found on the invoice (e.g. Tax ID, Due Date, Payment Terms, Notes).")

def parse_invoice_text_with_llm(raw_text: str) -> dict:
    """
    Pass raw OCR text to Gemini acting as an intelligent mapping layer.
    """
    api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        print("WARNING: GOOGLE_API_KEY is not set. Falling back to dummy LLM output for now.")
        # Provide a stub response to not crash the app if no API key is provided yet
        return {
            "invoiceNumber": "API_KEY_MISSING",
            "invoiceDate": "2026-01-01",
            "serviceProvider": "API_KEY_MISSING",
            "currencyGid": "USD",
            "amount": "0.00",
            "items": [],
            "additionalMetadata": {"Error": "Please add GOOGLE_API_KEY to .env to enable the LLM parser"}
        }

    try:
        # Use gemini-2.5-flash for speed and structural generation
        model = genai.GenerativeModel("gemini-2.5-flash")

        system_instruction = """
        You are a highly intelligent OCR text parsing assistant for Oracle Transportation Management (OTM).
        Your job is to read raw, unstructured text extracted from physical invoices, understand the various ways
        vendors format their data, and map them precisely to the provided JSON schema.
        
        Rules:
        1. Look for synonyms: 'Invoice No', 'Inv #', 'Bill Name' should map to `invoiceNumber`.
        2. 'Carrier', 'Transporter', 'From' should map to `serviceProvider`.
        3. Identify line items carefully. Usually, they have an INTL shipment reference, a cost type (like Base or Accessorial), and an amount.
        4. Any extra crucial fields (taxes, due dates, terms) should be added to `additionalMetadata` object.
        5. Return ONLY valid JSON adhering strictly to the schema provided.
        """

        prompt = f"""
        {system_instruction}
        
        Extract the structured data from the following raw OCR text:
        ======================
        {raw_text}
        ======================
        """

        result = model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                response_schema=InvoiceSchema,
                temperature=0.1
            ),
        )

        # Parse the JSON string returned by Gemini into a Python dictionary
        data = json.loads(result.text)
        
        # Convert List of dicts back to single dict for frontend compatibility
        if 'additionalMetadata' in data and isinstance(data['additionalMetadata'], list):
            meta_dict = {}
            for item in data['additionalMetadata']:
                if 'key' in item and 'value' in item:
                    meta_dict[item['key']] = item['value']
            data['additionalMetadata'] = meta_dict

        # Add the 'domainName' default required by our React UI
        data["domainName"] = "INTL"
        return data

    except Exception as e:
        print(f"LLM Parsing Error: {e}")
        # Return base error dict so frontend doesn't crash completely
        return {
            "invoiceNumber": "ERROR_PARSING",
            "invoiceDate": "",
            "serviceProvider": "ERROR_PARSING",
            "currencyGid": "USD",
            "amount": "0.00",
            "items": [],
            "additionalMetadata": {"parser_error": str(e)}
        }
