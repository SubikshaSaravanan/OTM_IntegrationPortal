"""
Generate a realistic Proof of Delivery (POD) PDF for OTM Shipment 111000.
Values are taken directly from the OTM Buy Shipment screenshot.
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT

OUTPUT = "Sample_POD_Shipment_111000.pdf"

doc = SimpleDocTemplate(
    OUTPUT,
    pagesize=A4,
    rightMargin=1.8*cm, leftMargin=1.8*cm,
    topMargin=1.5*cm, bottomMargin=1.5*cm,
)

styles = getSampleStyleSheet()

# ── custom styles ─────────────────────────────────────────────────────────
title_style = ParagraphStyle(
    "TitleStyle", parent=styles["Heading1"],
    fontSize=16, fontName="Helvetica-Bold",
    alignment=TA_CENTER, textColor=colors.HexColor("#1e3a5f"),
    spaceAfter=4
)
sub_style = ParagraphStyle(
    "SubStyle", parent=styles["Normal"],
    fontSize=9, fontName="Helvetica",
    alignment=TA_CENTER, textColor=colors.HexColor("#555555"),
    spaceAfter=2
)
label_style = ParagraphStyle(
    "LabelStyle", parent=styles["Normal"],
    fontSize=8, fontName="Helvetica-Bold",
    textColor=colors.HexColor("#1e3a5f")
)
value_style = ParagraphStyle(
    "ValueStyle", parent=styles["Normal"],
    fontSize=9, fontName="Helvetica",
    textColor=colors.black
)
section_header = ParagraphStyle(
    "SectionHeader", parent=styles["Normal"],
    fontSize=10, fontName="Helvetica-Bold",
    textColor=colors.white, backColor=colors.HexColor("#1e3a5f"),
    alignment=TA_LEFT, leftIndent=4, spaceAfter=0, spaceBefore=0
)
small_style = ParagraphStyle(
    "SmallStyle", parent=styles["Normal"],
    fontSize=8, fontName="Helvetica",
    textColor=colors.HexColor("#333333")
)
ack_style = ParagraphStyle(
    "AckStyle", parent=styles["Normal"],
    fontSize=9, fontName="Helvetica-Oblique",
    textColor=colors.HexColor("#333333"), spaceAfter=2
)

HEADER_BG   = colors.HexColor("#1e3a5f")
ALT_ROW     = colors.HexColor("#eef3fa")
BORDER_CLR  = colors.HexColor("#adc4de")
LIGHT_HDR   = colors.HexColor("#d0e4f5")

def tbl_style(data_rows=2, has_header=True):
    base = [
        ("GRID",        (0, 0), (-1, -1), 0.5, BORDER_CLR),
        ("FONTNAME",    (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE",    (0, 0), (-1, -1), 9),
        ("VALIGN",      (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",  (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING",(0,0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
    ]
    if has_header:
        base += [
            ("BACKGROUND", (0, 0), (-1, 0), HEADER_BG),
            ("TEXTCOLOR",  (0, 0), (-1, 0), colors.white),
            ("FONTNAME",   (0, 0), (-1, 0), "Helvetica-Bold"),
        ]
        for i in range(1, data_rows + 1, 2):
            base.append(("BACKGROUND", (0, i), (-1, i), ALT_ROW))
    else:
        for i in range(0, data_rows, 2):
            base.append(("BACKGROUND", (0, i), (-1, i), ALT_ROW))
    return TableStyle(base)

story = []

# ── TITLE ──────────────────────────────────────────────────────────────────
story.append(Paragraph("PROOF OF DELIVERY (POD)", title_style))
story.append(Paragraph("FTL Shipment – Oracle Transportation Management (OTM)", sub_style))
story.append(HRFlowable(width="100%", thickness=2, color=HEADER_BG, spaceAfter=10))

# ── SECTION 1: Shipment Identification ─────────────────────────────────────
id_data = [
    ["Field", "Value", "Field", "Value"],
    ["OTM Shipment GID",  "INTL.111000",          "Shipment XID",       "111000"],
    ["POD Number",        "POD-OTM-111000-001",    "Domain Name",        "INTL"],
    ["Service Provider",  "T1_ARFW",               "Shipment Type",      "TRANSPORT (TL)"],
    ["Start Time",        "18-Dec-2025  03:50:08", "End Time",           "27-Mar-2026  09:49:00"],
]
id_tbl = Table(id_data, colWidths=[4*cm, 5.5*cm, 4*cm, 5.5*cm], repeatRows=1)
id_tbl.setStyle(tbl_style(len(id_data)-1))
id_tbl.setStyle(TableStyle([
    ("FONTNAME", (0, 1), (0, -1), "Helvetica-Bold"),
    ("FONTNAME", (2, 1), (2, -1), "Helvetica-Bold"),
    ("TEXTCOLOR",(0, 1), (0, -1), colors.HexColor("#1e3a5f")),
    ("TEXTCOLOR",(2, 1), (2, -1), colors.HexColor("#1e3a5f")),
]))
story.append(id_tbl)
story.append(Spacer(1, 0.35*cm))

# ── SECTION 2: Origin / Destination ────────────────────────────────────────
od_data = [
    ["",            "Origin (Pickup)",                      "Destination (Delivery)"],
    ["Location",    "T1_ABC_INC\nOakridge, OR 97463, US",   "T1_STOCKTON_DC\nStockton, CA 95205, US"],
    ["Date",        "24-Dec-2025",                          "27-Mar-2026"],
    ["Time",        "03:50 AM (PST)",                       "09:49 AM (PST)"],
    ["Contact",     "ABC Warehouse Manager",                "Stockton DC Receiving"],
]
od_tbl = Table(od_data, colWidths=[3*cm, 8*cm, 8*cm], repeatRows=1)
od_tbl.setStyle(TableStyle([
    ("GRID",        (0,0), (-1,-1), 0.5, BORDER_CLR),
    ("FONTNAME",    (0,0), (-1,-1), "Helvetica"),
    ("FONTSIZE",    (0,0), (-1,-1), 9),
    ("VALIGN",      (0,0), (-1,-1), "TOP"),
    ("TOPPADDING",  (0,0), (-1,-1), 5),
    ("BOTTOMPADDING",(0,0),(-1,-1), 5),
    ("LEFTPADDING", (0,0), (-1,-1), 7),
    # header row
    ("BACKGROUND",  (0,0), (-1,0), HEADER_BG),
    ("TEXTCOLOR",   (0,0), (-1,0), colors.white),
    ("FONTNAME",    (0,0), (-1,0), "Helvetica-Bold"),
    ("ALIGN",       (0,0), (-1,0), "CENTER"),
    # label column
    ("BACKGROUND",  (0,1), (0,-1), LIGHT_HDR),
    ("FONTNAME",    (0,1), (0,-1), "Helvetica-Bold"),
    ("TEXTCOLOR",   (0,1), (0,-1), colors.HexColor("#1e3a5f")),
    # alt rows
    ("BACKGROUND", (1,2), (-1,2), ALT_ROW),
    ("BACKGROUND", (1,4), (-1,4), ALT_ROW),
]))
story.append(od_tbl)
story.append(Spacer(1, 0.35*cm))

# ── SECTION 3: Carrier & Vehicle Info ──────────────────────────────────────
cv_data = [
    ["Field", "Value", "Field", "Value"],
    ["Carrier ID",     "T1_ARFW",                  "Transport Mode",       "TL (Full Truck Load)"],
    ["Driver Name",    "Ramesh Kumar",              "Driver Mobile",        "+91 98XXXXXX21"],
    ["Vehicle Number", "KA05 AB 1234",              "Equipment Group",      "CP_CHKLD_4WS"],
    ["Main Itinerary", "27001",                     "Reference Number",     "T1_ARFW_000004"],
    ["Bill of Lading", "T1_ARFW_000004",            "G-LOG Identifier",     "INTL.111000"],
]
cv_tbl = Table(cv_data, colWidths=[4*cm, 5.5*cm, 4*cm, 5.5*cm], repeatRows=1)
cv_tbl.setStyle(tbl_style(len(cv_data)-1))
cv_tbl.setStyle(TableStyle([
    ("FONTNAME", (0,1),(0,-1), "Helvetica-Bold"),
    ("FONTNAME", (2,1),(2,-1), "Helvetica-Bold"),
    ("TEXTCOLOR",(0,1),(0,-1), colors.HexColor("#1e3a5f")),
    ("TEXTCOLOR",(2,1),(2,-1), colors.HexColor("#1e3a5f")),
]))
story.append(cv_tbl)
story.append(Spacer(1, 0.35*cm))

# ── SECTION 4: Cargo Details ────────────────────────────────────────────────
cargo_data = [
    ["Shipment Type",             "Commodity",                  "Gross Weight",   "Volume",        "Packages"],
    ["Full Truck Load (TL)",      "Finished Electrical Goods",  "22.68 KG",       "50.00 CU FT",   "10 units"],
]
cargo_tbl = Table(cargo_data, colWidths=[4.5*cm, 5*cm, 3*cm, 3*cm, 3.5*cm], repeatRows=1)
cargo_tbl.setStyle(tbl_style(1))
story.append(cargo_tbl)
story.append(Spacer(1, 0.35*cm))

# ── SECTION 5: Tracking Event to be Created ─────────────────────────────────
te_data = [
    ["OTM Tracking Event Detail", "Value"],
    ["Shipment GID",       "INTL.111000"],
    ["Status Code GID",    "D1  (Delivered)"],
    ["Reason Code GID",    "NS  (Normal)"],
    ["Responsible Party",  "CARRIER"],
    ["Event Date",         "2026-03-27T09:49:00+05:30"],
    ["Time Zone",          "Asia/Kolkata"],
    ["Event Received",     "2026-03-27T11:13:00+05:30"],
]
te_tbl = Table(te_data, colWidths=[6*cm, 13*cm], repeatRows=1)
te_tbl.setStyle(TableStyle([
    ("GRID",        (0,0), (-1,-1), 0.5, BORDER_CLR),
    ("FONTNAME",    (0,0), (-1,-1), "Helvetica"),
    ("FONTSIZE",    (0,0), (-1,-1), 9),
    ("VALIGN",      (0,0), (-1,-1), "MIDDLE"),
    ("TOPPADDING",  (0,0), (-1,-1), 5),
    ("BOTTOMPADDING",(0,0),(-1,-1), 5),
    ("LEFTPADDING", (0,0), (-1,-1), 7),
    ("BACKGROUND",  (0,0), (-1,0), HEADER_BG),
    ("TEXTCOLOR",   (0,0), (-1,0), colors.white),
    ("FONTNAME",    (0,0), (-1,0), "Helvetica-Bold"),
    ("SPAN",        (0,0), (-1,0)),
    ("ALIGN",       (0,0), (-1,0), "CENTER"),
    ("BACKGROUND",  (0,1), (0,-1), LIGHT_HDR),
    ("FONTNAME",    (0,1), (0,-1), "Helvetica-Bold"),
    ("TEXTCOLOR",   (0,1), (0,-1), colors.HexColor("#1e3a5f")),
    ("BACKGROUND", (0,2), (-1,2), ALT_ROW),
    ("BACKGROUND", (0,4), (-1,4), ALT_ROW),
    ("BACKGROUND", (0,6), (-1,6), ALT_ROW),
]))
story.append(te_tbl)
story.append(Spacer(1, 0.5*cm))

# ── Delivery Acknowledgement ─────────────────────────────────────────────────
story.append(HRFlowable(width="100%", thickness=1, color=HEADER_BG, spaceAfter=8))
story.append(Paragraph("<b>Delivery Acknowledgement</b>", label_style))
story.append(Spacer(1, 0.2*cm))
story.append(Paragraph(
    "I hereby confirm that the above FTL shipment (OTM Shipment GID: <b>INTL.111000</b>) has been "
    "received in full and in good condition at the destination <b>T1_STOCKTON_DC, Stockton, CA</b>.",
    ack_style
))
story.append(Spacer(1, 0.3*cm))

sig_data = [
    ["Name of Receiver:",    "Sunil Sharma",          "Date & Time:",        "27-Mar-2026  09:49 AM"],
    ["Designation:",         "Warehouse Manager",     "Shipment Status:",    "DELIVERED (D1)"],
    ["Company Stamp / Sig:", "_______________________","Verified by OTM:",   "INTL.INT01"],
]
sig_tbl = Table(sig_data, colWidths=[4*cm, 5.5*cm, 4*cm, 5.5*cm])
sig_tbl.setStyle(TableStyle([
    ("FONTNAME",    (0,0), (-1,-1), "Helvetica"),
    ("FONTSIZE",    (0,0), (-1,-1), 8.5),
    ("FONTNAME",    (0,0), (0,-1), "Helvetica-Bold"),
    ("FONTNAME",    (2,0), (2,-1), "Helvetica-Bold"),
    ("TEXTCOLOR",   (0,0), (0,-1), colors.HexColor("#1e3a5f")),
    ("TEXTCOLOR",   (2,0), (2,-1), colors.HexColor("#1e3a5f")),
    ("TOPPADDING",  (0,0), (-1,-1), 4),
    ("BOTTOMPADDING",(0,0),(-1,-1), 4),
    ("LEFTPADDING", (0,0), (-1,-1), 4),
    ("LINEBELOW",   (0,-1), (-1,-1), 0.5, BORDER_CLR),
]))
story.append(sig_tbl)
story.append(Spacer(1, 0.5*cm))

# ── Footer ───────────────────────────────────────────────────────────────────
story.append(HRFlowable(width="100%", thickness=1, color=HEADER_BG, spaceAfter=4))
story.append(Paragraph(
    "This document is system-generated for testing the OTM Shipment Tracking Event module. "
    "Reference: INTL.111000 | Carrier: T1_ARFW | Domain: INTL | Generated: 27-Mar-2026",
    small_style
))

doc.build(story)
print(f"✅  POD PDF created → {OUTPUT}")
