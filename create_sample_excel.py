import pandas as pd
import os

data = [
    {
        "Invoice Number": "INV-TEST-001",
        "Invoice Xid": "INV-TEST-001",
        "Currency Gid": "USD",
        "Servprov Alias Value": "GENERIC_VENDOR",
        "Invoice Refnum Qual Gid": "BM",
        "Invoice Refnum Value": "BOL-99001",
        "Cost Reference Gid": "SHP-12345",
        "Amount": 1500.00,
        "Cost Type": "B",
    },
    {
        "Invoice Number": "INV-TEST-001",
        "Invoice Xid": "INV-TEST-001",
        "Currency Gid": "USD",
        "Servprov Alias Value": "GENERIC_VENDOR",
        "Invoice Refnum Qual Gid": "BM",
        "Invoice Refnum Value": "BOL-99001",
        "Cost Reference Gid": "SHP-12345",
        "Amount": 250.00,
        "Cost Type": "A",
    },
    {
        "Invoice Number": "INV-TEST-002",
        "Invoice Xid": "INV-TEST-002",
        "Currency Gid": "INR",
        "Servprov Alias Value": "T1_ARFW",
        "Invoice Refnum Qual Gid": "BM",
        "Invoice Refnum Value": "BOL-99002",
        "Cost Reference Gid": "INTL.111000",
        "Amount": 3155.33,
        "Cost Type": "B",
    }
]

df = pd.DataFrame(data)

# Save to backend folder
output_path = os.path.join("backend", "Sample_OTM_Invoice.xlsx")
df.to_excel(output_path, index=False)

print(f"Sample Excel file successfully created at: {output_path}")
