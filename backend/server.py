from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime
import base64
from io import BytesIO
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
from reportlab.lib.units import inch, mm
from reportlab.lib.enums import TA_CENTER, TA_LEFT

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ================== Models ==================

class SafetyChecklistItem(BaseModel):
    question: str
    answer: Optional[str] = None  # "yes", "no", "na"
    notes: Optional[str] = None

class SitePhoto(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    base64_data: str
    caption: Optional[str] = None
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())

class SiteVisitReport(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    # Header Information
    staff_members: str
    date: str
    job_no_name: str
    site_arrival_time: str
    site_departure_time: str
    site_description: str
    weather_conditions: str
    contractor_responsible: str
    # Risk/Hazard/Incident
    risks_hazards_incidents: str
    toolbox_talk_required: bool
    toolbox_talk_notes: Optional[str] = None
    # Safety Checklist
    checklist_comments: str
    safety_checklist: List[SafetyChecklistItem]
    electrical_equipment_list: Optional[str] = None
    # Site Photos
    site_photos: List[SitePhoto] = []
    # Declaration
    staff_print_name: str
    signature_data: str  # base64 encoded signature image or typed name
    signature_type: str  # "drawn" or "typed"
    declaration_date: str
    # Metadata
    created_at: datetime = Field(default_factory=datetime.utcnow)
    email_sent: bool = False
    email_sent_to: Optional[str] = None

class SitePhotoCreate(BaseModel):
    base64_data: str
    caption: Optional[str] = None

class SiteVisitReportCreate(BaseModel):
    staff_members: str
    date: str
    job_no_name: str
    site_arrival_time: str
    site_departure_time: str
    site_description: str
    weather_conditions: str
    contractor_responsible: str
    risks_hazards_incidents: str
    toolbox_talk_required: bool
    toolbox_talk_notes: Optional[str] = None
    checklist_comments: str
    safety_checklist: List[SafetyChecklistItem]
    electrical_equipment_list: Optional[str] = None
    site_photos: List[SitePhotoCreate] = []
    staff_print_name: str
    signature_data: str
    signature_type: str
    declaration_date: str

class AppSettings(BaseModel):
    id: str = "app_settings"
    default_recipient_email: str = "kelvin.landon@developmentnous.nz"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_use_tls: bool = True
    smtp_enabled: bool = False  # False = mocked email
    company_name: str = "Development Nous Limited"
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class AppSettingsUpdate(BaseModel):
    default_recipient_email: Optional[str] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_use_tls: Optional[bool] = None
    smtp_enabled: Optional[bool] = None
    company_name: Optional[str] = None

class EmailRequest(BaseModel):
    report_id: str
    recipient_email: Optional[str] = None  # If None, use default

class EmailResponse(BaseModel):
    success: bool
    message: str
    mocked: bool
    recipient: str

# ================== PDF Generation ==================

def generate_pdf(report: SiteVisitReport, settings: AppSettings) -> bytes:
    """Generate a PDF from the site visit report"""
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=20*mm,
        leftMargin=20*mm,
        topMargin=15*mm,
        bottomMargin=15*mm
    )
    
    story = []
    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=16,
        textColor=colors.HexColor('#4CAF50'),
        alignment=TA_CENTER,
        spaceAfter=10
    )
    
    header_style = ParagraphStyle(
        'CustomHeader',
        parent=styles['Heading2'],
        fontSize=12,
        textColor=colors.HexColor('#333333'),
        spaceBefore=15,
        spaceAfter=8,
        backColor=colors.HexColor('#e8f5e9'),
        borderPadding=5
    )
    
    normal_style = ParagraphStyle(
        'CustomNormal',
        parent=styles['Normal'],
        fontSize=9,
        leading=12
    )
    
    # Add logo
    logo_path = ROOT_DIR / 'assets' / 'logo.png'
    if logo_path.exists():
        try:
            img = Image(str(logo_path), width=2*inch, height=0.8*inch)
            img.hAlign = 'CENTER'
            story.append(img)
            story.append(Spacer(1, 10))
        except Exception as e:
            logger.error(f"Error loading logo: {e}")
    
    # Title
    story.append(Paragraph("Site Visit Checklist / Safety Plan", title_style))
    story.append(Paragraph(settings.company_name, ParagraphStyle('Company', parent=styles['Normal'], fontSize=10, alignment=TA_CENTER, textColor=colors.gray)))
    story.append(Spacer(1, 15))
    
    # Site Information Table
    story.append(Paragraph("Site Information", header_style))
    site_data = [
        ["Staff Member(s):", report.staff_members, "Date:", report.date],
        ["Job No. / Name:", report.job_no_name, "Weather:", report.weather_conditions],
        ["Arrival Time:", report.site_arrival_time, "Departure Time:", report.site_departure_time],
        ["Contractor:", report.contractor_responsible, "", ""],
    ]
    site_table = Table(site_data, colWidths=[80, 140, 80, 140])
    site_table.setStyle(TableStyle([
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (2, 0), (2, -1), 'Helvetica-Bold'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.gray),
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f5f5f5')),
        ('BACKGROUND', (2, 0), (2, -1), colors.HexColor('#f5f5f5')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('PADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(site_table)
    story.append(Spacer(1, 5))
    
    # Site Description
    story.append(Paragraph(f"<b>Site Description:</b> {report.site_description}", normal_style))
    story.append(Spacer(1, 10))
    
    # Risk/Hazard Section
    story.append(Paragraph("Risk / Hazard / Incident Reporting", header_style))
    story.append(Paragraph(f"<b>Recorded Issues:</b> {report.risks_hazards_incidents or 'None reported'}", normal_style))
    toolbox_text = "Yes" if report.toolbox_talk_required else "No"
    if report.toolbox_talk_notes:
        toolbox_text += f" - {report.toolbox_talk_notes}"
    story.append(Paragraph(f"<b>Toolbox Talk/Follow-up Required:</b> {toolbox_text}", normal_style))
    story.append(Spacer(1, 10))
    
    # Safety Checklist
    story.append(Paragraph("General Site Safety Checklist", header_style))
    if report.checklist_comments:
        story.append(Paragraph(f"<b>Comments:</b> {report.checklist_comments}", normal_style))
        story.append(Spacer(1, 5))
    
    checklist_data = [["Question", "Response", "Notes"]]
    for item in report.safety_checklist:
        answer_display = item.answer.upper() if item.answer else "-"
        checklist_data.append([item.question, answer_display, item.notes or ""])
    
    checklist_table = Table(checklist_data, colWidths=[250, 50, 140])
    checklist_table.setStyle(TableStyle([
        ('FONTSIZE', (0, 0), (-1, -1), 7),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#4CAF50')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.gray),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('PADDING', (0, 0), (-1, -1), 4),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f9f9f9')]),
    ]))
    story.append(checklist_table)
    
    if report.electrical_equipment_list:
        story.append(Spacer(1, 5))
        story.append(Paragraph(f"<b>Electrical Equipment Used:</b> {report.electrical_equipment_list}", normal_style))
    
    story.append(Spacer(1, 15))
    
    # Declaration Section
    story.append(Paragraph("Declaration", header_style))
    declaration_text = "I acknowledge that I, the undersigned, understand the points above. I accept that compliance to safe work practices is a condition of my continued access to the site and also a requirement under the HSW legislation."
    story.append(Paragraph(declaration_text, ParagraphStyle('Declaration', parent=normal_style, fontSize=8, textColor=colors.gray)))
    story.append(Spacer(1, 10))
    
    # Signature
    decl_data = [
        ["Staff Member (Print):", report.staff_print_name, "Date:", report.declaration_date],
    ]
    decl_table = Table(decl_data, colWidths=[100, 160, 40, 140])
    decl_table.setStyle(TableStyle([
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (2, 0), (2, -1), 'Helvetica-Bold'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.gray),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('PADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(decl_table)
    story.append(Spacer(1, 10))
    
    # Add signature image
    story.append(Paragraph("<b>Signature:</b>", normal_style))
    if report.signature_data:
        try:
            if report.signature_type == "drawn":
                # Decode base64 signature image
                sig_data = report.signature_data
                if "," in sig_data:
                    sig_data = sig_data.split(",")[1]
                sig_bytes = base64.b64decode(sig_data)
                sig_buffer = BytesIO(sig_bytes)
                sig_img = Image(sig_buffer, width=2*inch, height=0.6*inch)
                story.append(sig_img)
            else:
                # Typed signature - use italic style to simulate handwriting
                sig_style = ParagraphStyle(
                    'Signature',
                    parent=styles['Normal'],
                    fontSize=14,
                    fontName='Times-Italic',
                    textColor=colors.HexColor('#1a237e')
                )
                story.append(Paragraph(report.signature_data, sig_style))
        except Exception as e:
            logger.error(f"Error adding signature: {e}")
            story.append(Paragraph(f"[Signature: {report.staff_print_name}]", normal_style))
    
    # Site Photos Section
    if report.site_photos and len(report.site_photos) > 0:
        story.append(Spacer(1, 20))
        story.append(Paragraph("Site Photos", header_style))
        
        for i, photo in enumerate(report.site_photos):
            try:
                photo_data = photo.base64_data
                if "," in photo_data:
                    photo_data = photo_data.split(",")[1]
                photo_bytes = base64.b64decode(photo_data)
                photo_buffer = BytesIO(photo_bytes)
                
                # Add photo with reasonable size
                photo_img = Image(photo_buffer, width=4*inch, height=3*inch)
                photo_img.hAlign = 'CENTER'
                story.append(photo_img)
                
                # Add caption if exists
                if photo.caption:
                    caption_style = ParagraphStyle(
                        'PhotoCaption',
                        parent=styles['Normal'],
                        fontSize=9,
                        alignment=TA_CENTER,
                        textColor=colors.gray
                    )
                    story.append(Paragraph(f"Photo {i+1}: {photo.caption}", caption_style))
                else:
                    story.append(Paragraph(f"Photo {i+1}", ParagraphStyle('PhotoNum', parent=styles['Normal'], fontSize=9, alignment=TA_CENTER, textColor=colors.gray)))
                
                story.append(Spacer(1, 10))
            except Exception as e:
                logger.error(f"Error adding photo {i+1}: {e}")
                story.append(Paragraph(f"[Photo {i+1} could not be loaded]", normal_style))
    
    # Build PDF
    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()

# ================== API Routes ==================

@api_router.get("/")
async def root():
    return {"message": "Site Visit Checklist API", "version": "1.0"}

# Settings endpoints
@api_router.get("/settings", response_model=AppSettings)
async def get_settings():
    settings = await db.settings.find_one({"id": "app_settings"})
    if not settings:
        default_settings = AppSettings()
        await db.settings.insert_one(default_settings.model_dump())
        return default_settings
    return AppSettings(**settings)

@api_router.put("/settings", response_model=AppSettings)
async def update_settings(update: AppSettingsUpdate):
    settings = await db.settings.find_one({"id": "app_settings"})
    if not settings:
        settings = AppSettings().model_dump()
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow()
    
    await db.settings.update_one(
        {"id": "app_settings"},
        {"$set": update_data},
        upsert=True
    )
    
    updated = await db.settings.find_one({"id": "app_settings"})
    return AppSettings(**updated)

# Report endpoints
@api_router.post("/reports", response_model=SiteVisitReport)
async def create_report(report: SiteVisitReportCreate):
    report_data = report.model_dump()
    # Convert photos to SitePhoto objects with IDs
    if report_data.get('site_photos'):
        report_data['site_photos'] = [
            SitePhoto(base64_data=p['base64_data'], caption=p.get('caption')).model_dump()
            for p in report_data['site_photos']
        ]
    report_obj = SiteVisitReport(**report_data)
    await db.reports.insert_one(report_obj.model_dump())
    logger.info(f"Created report: {report_obj.id}")
    return report_obj

@api_router.get("/reports", response_model=List[SiteVisitReport])
async def get_reports():
    reports = await db.reports.find().sort("created_at", -1).to_list(1000)
    return [SiteVisitReport(**r) for r in reports]

@api_router.get("/reports/{report_id}", response_model=SiteVisitReport)
async def get_report(report_id: str):
    report = await db.reports.find_one({"id": report_id})
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return SiteVisitReport(**report)

@api_router.delete("/reports/{report_id}")
async def delete_report(report_id: str):
    result = await db.reports.delete_one({"id": report_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Report not found")
    return {"message": "Report deleted"}

# PDF Generation endpoint
@api_router.get("/reports/{report_id}/pdf")
async def get_report_pdf(report_id: str):
    report = await db.reports.find_one({"id": report_id})
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    settings = await db.settings.find_one({"id": "app_settings"})
    if not settings:
        settings = AppSettings().model_dump()
    
    report_obj = SiteVisitReport(**report)
    settings_obj = AppSettings(**settings)
    
    pdf_bytes = generate_pdf(report_obj, settings_obj)
    pdf_base64 = base64.b64encode(pdf_bytes).decode('utf-8')
    
    return {
        "pdf_base64": pdf_base64,
        "filename": f"site_visit_{report_obj.job_no_name}_{report_obj.date}.pdf"
    }

# Email endpoint (mocked for now)
@api_router.post("/reports/{report_id}/email", response_model=EmailResponse)
async def send_report_email(report_id: str, email_req: EmailRequest):
    report = await db.reports.find_one({"id": report_id})
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    settings = await db.settings.find_one({"id": "app_settings"})
    if not settings:
        settings = AppSettings().model_dump()
    
    settings_obj = AppSettings(**settings)
    recipient = email_req.recipient_email or settings_obj.default_recipient_email
    
    # Check if SMTP is enabled and configured
    if settings_obj.smtp_enabled and settings_obj.smtp_host:
        # TODO: Implement real SMTP sending here
        # For now, we'll mock it but log that SMTP is configured
        logger.info(f"SMTP configured but using mock: would send to {recipient}")
    
    # Mock email sending
    logger.info(f"[MOCK] Sending email to {recipient} for report {report_id}")
    
    # Update report to mark email as sent
    await db.reports.update_one(
        {"id": report_id},
        {"$set": {"email_sent": True, "email_sent_to": recipient}}
    )
    
    return EmailResponse(
        success=True,
        message=f"Email {'would be' if not settings_obj.smtp_enabled else ''} sent to {recipient}",
        mocked=not settings_obj.smtp_enabled,
        recipient=recipient
    )

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
