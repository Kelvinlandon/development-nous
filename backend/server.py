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
import csv
import httpx
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication
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

class StaffMember(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Job(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    job_number: str
    job_name: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

class StaffMemberCreate(BaseModel):
    name: str

class JobCreate(BaseModel):
    job_number: str
    job_name: str

class SafetyChecklistItem(BaseModel):
    question: str
    answer: Optional[str] = None  # "yes", "no", "na"
    notes: Optional[str] = None

class SitePhoto(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    base64_data: str
    caption: Optional[str] = None
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    # Location metadata
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    address: Optional[str] = None

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
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    address: Optional[str] = None
    timestamp: Optional[str] = None

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
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_use_tls: bool = True
    smtp_enabled: bool = False  # False = mocked email
    company_name: str = "Development Nous Limited"
    # External data sync URLs
    staff_csv_url: str = ""
    jobs_csv_url: str = ""
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
    staff_csv_url: Optional[str] = None
    jobs_csv_url: Optional[str] = None

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
    """Generate a beautiful PDF from the site visit report"""
    buffer = BytesIO()
    
    # Colors
    GREEN = colors.HexColor('#4CAF50')
    DARK_GREEN = colors.HexColor('#2E7D32')
    LIGHT_GREEN = colors.HexColor('#E8F5E9')
    DARK = colors.HexColor('#1a1a1a')
    GRAY = colors.HexColor('#666666')
    LIGHT_GRAY = colors.HexColor('#f5f5f5')
    WHITE = colors.white
    ORANGE = colors.HexColor('#FF9800')
    RED = colors.HexColor('#F44336')
    
    def on_first_page(canvas, doc):
        """Draw a dark header bar with logo and Harry on the first page"""
        canvas.saveState()
        # Dark header background
        canvas.setFillColor(DARK)
        canvas.rect(0, A4[1] - 85, A4[0], 85, fill=True, stroke=False)
        
        # Green accent line under header
        canvas.setFillColor(GREEN)
        canvas.rect(0, A4[1] - 88, A4[0], 3, fill=True, stroke=False)
        
        # Add DNL logo (center)
        logo_path = ROOT_DIR / 'assets' / 'dnl_logo.png'
        if logo_path.exists():
            try:
                canvas.drawImage(str(logo_path), A4[0]/2 - 55, A4[1] - 65, width=110, height=40, preserveAspectRatio=True, mask='auto')
            except Exception:
                pass
        
        # Add Harry (right side)
        harry_path = ROOT_DIR / 'assets' / 'harry.png'
        if harry_path.exists():
            try:
                canvas.drawImage(str(harry_path), A4[0] - 80, A4[1] - 78, width=55, height=55, preserveAspectRatio=True, mask='auto')
            except Exception:
                pass
        
        # Tagline
        canvas.setFillColor(GREEN)
        canvas.setFont('Helvetica-Oblique', 8)
        canvas.drawCentredString(A4[0]/2, A4[1] - 80, "Take ya time and Paws for safety!")
        
        # Footer on every page
        canvas.setFillColor(LIGHT_GRAY)
        canvas.rect(0, 0, A4[0], 30, fill=True, stroke=False)
        canvas.setFillColor(GREEN)
        canvas.rect(0, 30, A4[0], 2, fill=True, stroke=False)
        canvas.setFillColor(GRAY)
        canvas.setFont('Helvetica', 7)
        canvas.drawCentredString(A4[0]/2, 12, f"{settings.company_name}  |  SafetyPaws Site Visit Report  |  {report.date}")
        
        canvas.restoreState()
    
    def on_later_pages(canvas, doc):
        """Footer only on subsequent pages"""
        canvas.saveState()
        # Footer
        canvas.setFillColor(LIGHT_GRAY)
        canvas.rect(0, 0, A4[0], 30, fill=True, stroke=False)
        canvas.setFillColor(GREEN)
        canvas.rect(0, 30, A4[0], 2, fill=True, stroke=False)
        canvas.setFillColor(GRAY)
        canvas.setFont('Helvetica', 7)
        canvas.drawCentredString(A4[0]/2, 12, f"{settings.company_name}  |  SafetyPaws Site Visit Report  |  Page {doc.page}")
        
        # Small Harry in top right corner
        harry_path = ROOT_DIR / 'assets' / 'harry.png'
        if harry_path.exists():
            try:
                canvas.drawImage(str(harry_path), A4[0] - 50, A4[1] - 45, width=30, height=30, preserveAspectRatio=True, mask='auto')
            except Exception:
                pass
        
        canvas.restoreState()
    
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=20*mm,
        leftMargin=20*mm,
        topMargin=95,  # Space for header on first page
        bottomMargin=40
    )
    
    story = []
    styles = getSampleStyleSheet()
    
    # ---- Custom Styles ----
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=18,
        textColor=DARK_GREEN,
        alignment=TA_CENTER,
        spaceAfter=4,
        fontName='Helvetica-Bold'
    )
    
    subtitle_style = ParagraphStyle(
        'Subtitle',
        parent=styles['Normal'],
        fontSize=10,
        alignment=TA_CENTER,
        textColor=GRAY,
        spaceAfter=15
    )
    
    section_style = ParagraphStyle(
        'SectionHeader',
        parent=styles['Heading2'],
        fontSize=12,
        textColor=WHITE,
        spaceBefore=12,
        spaceAfter=8,
        backColor=GREEN,
        borderPadding=(6, 8, 6, 8),
        fontName='Helvetica-Bold',
        leading=16
    )
    
    normal_style = ParagraphStyle(
        'CustomNormal',
        parent=styles['Normal'],
        fontSize=9,
        leading=13,
        textColor=colors.HexColor('#333333')
    )
    
    small_style = ParagraphStyle(
        'SmallText',
        parent=styles['Normal'],
        fontSize=7,
        leading=10,
        textColor=GRAY
    )
    
    # ---- Title ----
    story.append(Paragraph("Site Visit Checklist / Safety Plan", title_style))
    story.append(Paragraph(f"{report.job_no_name}  —  {report.date}", subtitle_style))
    
    # ---- Site Information ----
    story.append(Paragraph("Site Information", section_style))
    story.append(Spacer(1, 4))
    
    site_data = [
        [Paragraph("<b>Staff Member(s)</b>", small_style), Paragraph(report.staff_members, normal_style),
         Paragraph("<b>Date</b>", small_style), Paragraph(report.date, normal_style)],
        [Paragraph("<b>Job No. / Name</b>", small_style), Paragraph(report.job_no_name, normal_style),
         Paragraph("<b>Weather</b>", small_style), Paragraph(report.weather_conditions, normal_style)],
        [Paragraph("<b>Arrival Time</b>", small_style), Paragraph(report.site_arrival_time, normal_style),
         Paragraph("<b>Departure Time</b>", small_style), Paragraph(report.site_departure_time, normal_style)],
        [Paragraph("<b>Contractor</b>", small_style), Paragraph(report.contractor_responsible, normal_style),
         "", ""],
    ]
    site_table = Table(site_data, colWidths=[75, 145, 75, 145])
    site_table.setStyle(TableStyle([
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e0e0e0')),
        ('BACKGROUND', (0, 0), (0, -1), LIGHT_GREEN),
        ('BACKGROUND', (2, 0), (2, -1), LIGHT_GREEN),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('ROUNDEDCORNERS', [4, 4, 4, 4]),
    ]))
    story.append(site_table)
    
    # Site Description box
    if report.site_description:
        story.append(Spacer(1, 6))
        desc_data = [[Paragraph("<b>Site Description</b>", small_style)], [Paragraph(report.site_description, normal_style)]]
        desc_table = Table(desc_data, colWidths=[440])
        desc_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), LIGHT_GREEN),
            ('BACKGROUND', (0, 1), (-1, 1), WHITE),
            ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#e0e0e0')),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ]))
        story.append(desc_table)
    
    # ---- Risk / Hazard Section ----
    story.append(Spacer(1, 4))
    story.append(Paragraph("Risk / Hazard / Incident Reporting", section_style))
    story.append(Spacer(1, 4))
    
    hazard_text = report.risks_hazards_incidents or 'None reported'
    toolbox_text = "Yes" if report.toolbox_talk_required else "No"
    if report.toolbox_talk_notes:
        toolbox_text += f" — {report.toolbox_talk_notes}"
    
    hazard_data = [
        [Paragraph("<b>Recorded Issues</b>", small_style), Paragraph(hazard_text, normal_style)],
        [Paragraph("<b>Toolbox Talk Required</b>", small_style), Paragraph(toolbox_text, normal_style)],
    ]
    hazard_table = Table(hazard_data, colWidths=[120, 320])
    hazard_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#FFF3E0')),
        ('BOX', (0, 0), (-1, -1), 0.5, ORANGE),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#FFE0B2')),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(hazard_table)
    
    # ---- Safety Checklist ----
    story.append(Spacer(1, 4))
    story.append(Paragraph("General Site Safety Checklist", section_style))
    story.append(Spacer(1, 4))
    
    if report.checklist_comments:
        story.append(Paragraph(f"<b>General Comments:</b> {report.checklist_comments}", normal_style))
        story.append(Spacer(1, 6))
    
    checklist_header = [
        Paragraph("<b>Question</b>", ParagraphStyle('CH', parent=small_style, textColor=WHITE, fontName='Helvetica-Bold')),
        Paragraph("<b>Response</b>", ParagraphStyle('CH2', parent=small_style, textColor=WHITE, fontName='Helvetica-Bold', alignment=TA_CENTER)),
        Paragraph("<b>Notes</b>", ParagraphStyle('CH3', parent=small_style, textColor=WHITE, fontName='Helvetica-Bold'))
    ]
    checklist_data = [checklist_header]
    for item in report.safety_checklist:
        answer_display = item.answer.upper() if item.answer else "-"
        # Color-code the answer
        if item.answer == 'yes':
            ans_color = DARK_GREEN
        elif item.answer == 'no':
            ans_color = RED
        else:
            ans_color = ORANGE
        
        answer_para = Paragraph(
            f"<b>{answer_display}</b>",
            ParagraphStyle('Ans', parent=small_style, textColor=ans_color, alignment=TA_CENTER, fontSize=8, fontName='Helvetica-Bold')
        )
        
        checklist_data.append([
            Paragraph(item.question, ParagraphStyle('Q', parent=normal_style, fontSize=8)),
            answer_para,
            Paragraph(item.notes or "", ParagraphStyle('N', parent=small_style, fontSize=7, textColor=colors.HexColor('#555555')))
        ])
    
    checklist_table = Table(checklist_data, colWidths=[230, 50, 160])
    checklist_table.setStyle(TableStyle([
        ('FONTSIZE', (0, 0), (-1, -1), 7),
        ('BACKGROUND', (0, 0), (-1, 0), DARK_GREEN),
        ('TEXTCOLOR', (0, 0), (-1, 0), WHITE),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#c8e6c9')),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e0e0e0')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [WHITE, colors.HexColor('#f8fdf8')]),
    ]))
    story.append(checklist_table)
    
    if report.electrical_equipment_list:
        story.append(Spacer(1, 6))
        story.append(Paragraph(f"<b>Electrical Equipment Used:</b> {report.electrical_equipment_list}", normal_style))
    
    # ---- Declaration ----
    story.append(Spacer(1, 8))
    story.append(Paragraph("Declaration", section_style))
    story.append(Spacer(1, 4))
    
    declaration_text = "I acknowledge that I, the undersigned, understand the points above. I accept that compliance to safe work practices is a condition of my continued access to the site and also a requirement under the HSW legislation."
    decl_box_data = [[Paragraph(declaration_text, ParagraphStyle('Decl', parent=normal_style, fontSize=8, textColor=GRAY, fontName='Helvetica-Oblique'))]]
    decl_box = Table(decl_box_data, colWidths=[440])
    decl_box.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), LIGHT_GREEN),
        ('BOX', (0, 0), (-1, -1), 1, GREEN),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
    ]))
    story.append(decl_box)
    story.append(Spacer(1, 8))
    
    # Signature table
    decl_data = [
        [Paragraph("<b>Staff Member (Print)</b>", small_style), Paragraph(report.staff_print_name, normal_style),
         Paragraph("<b>Date</b>", small_style), Paragraph(report.declaration_date, normal_style)],
    ]
    decl_table = Table(decl_data, colWidths=[100, 160, 40, 140])
    decl_table.setStyle(TableStyle([
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#e0e0e0')),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e0e0e0')),
        ('BACKGROUND', (0, 0), (0, 0), LIGHT_GREEN),
        ('BACKGROUND', (2, 0), (2, 0), LIGHT_GREEN),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(decl_table)
    story.append(Spacer(1, 8))
    
    # Signature
    story.append(Paragraph("<b>Signature:</b>", normal_style))
    if report.signature_data:
        try:
            if report.signature_type == "drawn":
                sig_data = report.signature_data
                if "," in sig_data:
                    sig_data = sig_data.split(",")[1]
                sig_bytes = base64.b64decode(sig_data)
                sig_buffer = BytesIO(sig_bytes)
                sig_img = Image(sig_buffer, width=2*inch, height=0.6*inch)
                story.append(sig_img)
            else:
                sig_style = ParagraphStyle(
                    'Signature',
                    parent=styles['Normal'],
                    fontSize=16,
                    fontName='Times-Italic',
                    textColor=colors.HexColor('#1a237e')
                )
                story.append(Paragraph(report.signature_data, sig_style))
        except Exception as e:
            logger.error(f"Error adding signature: {e}")
            story.append(Paragraph(f"[Signature: {report.staff_print_name}]", normal_style))
    
    # ---- Site Photos ----
    if report.site_photos and len(report.site_photos) > 0:
        story.append(Spacer(1, 12))
        story.append(Paragraph(f"Site Photos ({len(report.site_photos)})", section_style))
        story.append(Spacer(1, 6))
        
        for i, photo in enumerate(report.site_photos):
            try:
                photo_data = photo.base64_data
                if "," in photo_data:
                    photo_data = photo_data.split(",")[1]
                photo_bytes = base64.b64decode(photo_data)
                photo_buffer = BytesIO(photo_bytes)
                
                # Photo name from caption
                photo_name = ""
                photo_comment = ""
                if photo.caption:
                    caption_lines = photo.caption.split('\n')
                    photo_name = caption_lines[0]
                    if len(caption_lines) > 1:
                        photo_comment = '\n'.join(caption_lines[1:])
                if not photo_name:
                    photo_name = f"Photo {i+1}"
                
                # Photo name header with green accent
                name_style = ParagraphStyle(
                    f'PhotoName{i}',
                    parent=styles['Normal'],
                    fontSize=10,
                    fontName='Helvetica-Bold',
                    textColor=DARK_GREEN,
                    spaceBefore=6
                )
                story.append(Paragraph(f"📸 {photo_name}", name_style))
                
                # Photo image
                photo_img = Image(photo_buffer, width=4.5*inch, height=3.2*inch)
                photo_img.hAlign = 'CENTER'
                story.append(photo_img)
                
                # Comment
                if photo_comment:
                    comment_style = ParagraphStyle(
                        f'PhotoComment{i}',
                        parent=styles['Normal'],
                        fontSize=9,
                        alignment=TA_CENTER,
                        textColor=colors.HexColor('#444444'),
                        fontName='Helvetica-Oblique',
                        spaceBefore=2
                    )
                    story.append(Paragraph(f'"{photo_comment}"', comment_style))
                
                # Metadata
                meta_parts = []
                if photo.timestamp:
                    try:
                        from datetime import datetime as dt
                        ts = dt.fromisoformat(photo.timestamp.replace('Z', '+00:00'))
                        meta_parts.append(f"Taken: {ts.strftime('%Y-%m-%d %H:%M')}")
                    except Exception:
                        meta_parts.append(f"Taken: {photo.timestamp}")
                
                if photo.address:
                    meta_parts.append(f"Location: {photo.address}")
                elif photo.latitude and photo.longitude:
                    meta_parts.append(f"GPS: {photo.latitude:.6f}, {photo.longitude:.6f}")
                
                if meta_parts:
                    meta_text = " | ".join(meta_parts)
                    meta_style = ParagraphStyle(
                        f'PhotoMeta{i}',
                        parent=styles['Normal'],
                        fontSize=7,
                        alignment=TA_CENTER,
                        textColor=GRAY
                    )
                    story.append(Paragraph(meta_text, meta_style))
                
                # Separator between photos
                story.append(Spacer(1, 8))
                if i < len(report.site_photos) - 1:
                    sep_data = [[""]]
                    sep = Table(sep_data, colWidths=[440])
                    sep.setStyle(TableStyle([
                        ('LINEBELOW', (0, 0), (-1, -1), 0.5, colors.HexColor('#e0e0e0')),
                        ('TOPPADDING', (0, 0), (-1, -1), 0),
                        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                    ]))
                    story.append(sep)
                    
            except Exception as e:
                logger.error(f"Error adding photo {i+1}: {e}")
                story.append(Paragraph(f"[Photo {i+1} could not be loaded]", normal_style))
    
    # Build PDF
    doc.build(story, onFirstPage=on_first_page, onLaterPages=on_later_pages)
    buffer.seek(0)
    return buffer.getvalue()

# ================== API Routes ==================

@api_router.get("/")
async def root():
    return {"message": "Site Visit Checklist API", "version": "1.0"}

# Staff Member endpoints
@api_router.get("/staff", response_model=List[StaffMember])
async def get_staff():
    staff = await db.staff.find().sort("name", 1).to_list(1000)
    return [StaffMember(**s) for s in staff]

@api_router.post("/staff", response_model=StaffMember)
async def create_staff(staff: StaffMemberCreate):
    # Check if already exists
    existing = await db.staff.find_one({"name": {"$regex": f"^{staff.name}$", "$options": "i"}})
    if existing:
        return StaffMember(**existing)
    
    staff_obj = StaffMember(name=staff.name)
    await db.staff.insert_one(staff_obj.model_dump())
    return staff_obj

@api_router.delete("/staff/{staff_id}")
async def delete_staff(staff_id: str):
    result = await db.staff.delete_one({"id": staff_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Staff member not found")
    return {"message": "Staff member deleted"}

# Job endpoints
@api_router.get("/jobs", response_model=List[Job])
async def get_jobs():
    jobs = await db.jobs.find().sort("job_number", 1).to_list(1000)
    return [Job(**j) for j in jobs]

@api_router.post("/jobs", response_model=Job)
async def create_job(job: JobCreate):
    # Check if already exists
    existing = await db.jobs.find_one({"job_number": {"$regex": f"^{job.job_number}$", "$options": "i"}})
    if existing:
        return Job(**existing)
    
    job_obj = Job(job_number=job.job_number, job_name=job.job_name)
    await db.jobs.insert_one(job_obj.model_dump())
    return job_obj

@api_router.delete("/jobs/{job_id}")
async def delete_job(job_id: str):
    result = await db.jobs.delete_one({"id": job_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"message": "Job deleted"}

# Sync from external CSV endpoints
class SyncResponse(BaseModel):
    success: bool
    message: str
    staff_count: int = 0
    jobs_count: int = 0

@api_router.post("/sync", response_model=SyncResponse)
async def sync_from_csv():
    """Sync staff and jobs from external CSV URLs configured in settings"""
    settings = await db.settings.find_one({"id": "app_settings"})
    if not settings:
        settings = AppSettings().model_dump()
    
    staff_count = 0
    jobs_count = 0
    errors = []
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Sync Staff from CSV
        if settings.get('staff_csv_url'):
            try:
                response = await client.get(settings['staff_csv_url'])
                response.raise_for_status()
                
                # Parse CSV
                content = response.text
                reader = csv.DictReader(content.splitlines())
                
                # Clear existing staff and add new ones
                await db.staff.delete_many({})
                
                for row in reader:
                    # Support columns: name, Name, staff_name, Staff Name
                    name = row.get('name') or row.get('Name') or row.get('staff_name') or row.get('Staff Name') or row.get('Staff')
                    if name and name.strip():
                        staff_obj = StaffMember(name=name.strip())
                        await db.staff.insert_one(staff_obj.model_dump())
                        staff_count += 1
                        
                logger.info(f"Synced {staff_count} staff members from CSV")
            except Exception as e:
                logger.error(f"Error syncing staff CSV: {e}")
                errors.append(f"Staff sync failed: {str(e)}")
        
        # Sync Jobs from CSV
        if settings.get('jobs_csv_url'):
            try:
                response = await client.get(settings['jobs_csv_url'])
                response.raise_for_status()
                
                # Parse CSV
                content = response.text
                reader = csv.DictReader(content.splitlines())
                
                # Clear existing jobs and add new ones
                await db.jobs.delete_many({})
                
                for row in reader:
                    # Support columns: job_number, Job Number, number, Number
                    job_number = row.get('job_number') or row.get('Job Number') or row.get('number') or row.get('Number') or row.get('Job No')
                    # Support columns: job_name, Job Name, name, Name, description
                    job_name = row.get('job_name') or row.get('Job Name') or row.get('name') or row.get('Name') or row.get('Description')
                    
                    if job_number and job_number.strip():
                        job_obj = Job(
                            job_number=job_number.strip(),
                            job_name=(job_name or '').strip()
                        )
                        await db.jobs.insert_one(job_obj.model_dump())
                        jobs_count += 1
                        
                logger.info(f"Synced {jobs_count} jobs from CSV")
            except Exception as e:
                logger.error(f"Error syncing jobs CSV: {e}")
                errors.append(f"Jobs sync failed: {str(e)}")
    
    if errors:
        return SyncResponse(
            success=False,
            message="; ".join(errors),
            staff_count=staff_count,
            jobs_count=jobs_count
        )
    
    return SyncResponse(
        success=True,
        message=f"Successfully synced {staff_count} staff members and {jobs_count} jobs",
        staff_count=staff_count,
        jobs_count=jobs_count
    )

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
            SitePhoto(
                base64_data=p['base64_data'], 
                caption=p.get('caption'),
                latitude=p.get('latitude'),
                longitude=p.get('longitude'),
                address=p.get('address'),
                timestamp=p.get('timestamp') or datetime.utcnow().isoformat()
            ).model_dump()
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

# ================== Email Sending ==================

def send_smtp_email(
    smtp_host: str,
    smtp_port: int,
    smtp_username: str,
    smtp_password: str,
    smtp_use_tls: bool,
    recipient: str,
    subject: str,
    html_body: str,
    pdf_bytes: bytes,
    pdf_filename: str,
) -> None:
    """Send an email with PDF attachment via SMTP (Gmail compatible)"""
    msg = MIMEMultipart('mixed')
    msg['From'] = smtp_username
    msg['To'] = recipient
    msg['Subject'] = subject

    # Attach HTML body
    html_part = MIMEText(html_body, 'html')
    msg.attach(html_part)

    # Attach PDF
    pdf_part = MIMEApplication(pdf_bytes, _subtype='pdf')
    pdf_part.add_header('Content-Disposition', 'attachment', filename=pdf_filename)
    msg.attach(pdf_part)

    # Send via SMTP
    if smtp_use_tls:
        server = smtplib.SMTP(smtp_host, smtp_port, timeout=30)
        server.ehlo()
        server.starttls()
        server.ehlo()
    else:
        server = smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=30)
    
    server.login(smtp_username, smtp_password)
    server.sendmail(smtp_username, recipient, msg.as_string())
    server.quit()


def build_email_html(report: SiteVisitReport, settings: AppSettings) -> str:
    """Build a nice HTML email body with report summary"""
    checklist_rows = ""
    for item in report.safety_checklist:
        answer = item.answer.upper() if item.answer else "-"
        color = "#4CAF50" if item.answer == "yes" else "#F44336" if item.answer == "no" else "#FF9800"
        checklist_rows += f"""
        <tr>
            <td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:13px;">{item.question}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center;">
                <span style="background:{color};color:#fff;padding:2px 10px;border-radius:10px;font-size:11px;font-weight:600;">{answer}</span>
            </td>
        </tr>"""

    photo_count = len(report.site_photos) if report.site_photos else 0
    toolbox = "Yes" if report.toolbox_talk_required else "No"
    if report.toolbox_talk_notes:
        toolbox += f" — {report.toolbox_talk_notes}"

    html = f"""
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#333;">
        <div style="background:#4CAF50;padding:20px;text-align:center;border-radius:8px 8px 0 0;">
            <h1 style="color:#fff;margin:0;font-size:22px;">Site Visit Report</h1>
            <p style="color:#e8f5e9;margin:6px 0 0;font-size:13px;">{settings.company_name}</p>
        </div>
        
        <div style="background:#fff;padding:20px;border:1px solid #e0e0e0;">
            <h2 style="color:#4CAF50;font-size:16px;margin:0 0 15px;border-bottom:2px solid #4CAF50;padding-bottom:8px;">
                {report.job_no_name}
            </h2>
            
            <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
                <tr>
                    <td style="padding:6px 0;color:#666;font-size:13px;width:140px;"><strong>Date:</strong></td>
                    <td style="padding:6px 0;font-size:13px;">{report.date}</td>
                </tr>
                <tr>
                    <td style="padding:6px 0;color:#666;font-size:13px;"><strong>Staff Member(s):</strong></td>
                    <td style="padding:6px 0;font-size:13px;">{report.staff_members}</td>
                </tr>
                <tr>
                    <td style="padding:6px 0;color:#666;font-size:13px;"><strong>Arrival:</strong></td>
                    <td style="padding:6px 0;font-size:13px;">{report.site_arrival_time}</td>
                </tr>
                <tr>
                    <td style="padding:6px 0;color:#666;font-size:13px;"><strong>Departure:</strong></td>
                    <td style="padding:6px 0;font-size:13px;">{report.site_departure_time}</td>
                </tr>
                <tr>
                    <td style="padding:6px 0;color:#666;font-size:13px;"><strong>Weather:</strong></td>
                    <td style="padding:6px 0;font-size:13px;">{report.weather_conditions}</td>
                </tr>
                <tr>
                    <td style="padding:6px 0;color:#666;font-size:13px;"><strong>Contractor:</strong></td>
                    <td style="padding:6px 0;font-size:13px;">{report.contractor_responsible}</td>
                </tr>
            </table>

            <div style="background:#f5f5f5;padding:12px;border-radius:6px;margin-bottom:15px;">
                <strong style="font-size:13px;color:#666;">Site Description:</strong>
                <p style="margin:6px 0 0;font-size:13px;">{report.site_description}</p>
            </div>

            <div style="background:#fff3e0;padding:12px;border-radius:6px;margin-bottom:15px;border-left:3px solid #FF9800;">
                <strong style="font-size:13px;color:#e65100;">Risks / Hazards / Incidents:</strong>
                <p style="margin:6px 0 0;font-size:13px;">{report.risks_hazards_incidents or 'None reported'}</p>
                <p style="margin:6px 0 0;font-size:12px;color:#666;"><strong>Toolbox Talk Required:</strong> {toolbox}</p>
            </div>

            <h3 style="color:#4CAF50;font-size:14px;margin:20px 0 10px;">Safety Checklist</h3>
            <table style="width:100%;border-collapse:collapse;">
                {checklist_rows}
            </table>

            <div style="margin-top:20px;padding:12px;background:#e8f5e9;border-radius:6px;border-left:3px solid #4CAF50;">
                <strong style="font-size:13px;">Declaration</strong>
                <p style="font-size:12px;color:#666;margin:6px 0;">
                    Signed by <strong>{report.staff_print_name}</strong> on {report.declaration_date}
                </p>
            </div>

            <p style="font-size:12px;color:#888;margin-top:15px;text-align:center;">
                {photo_count} site photo(s) included in the attached PDF report.
            </p>
        </div>
        
        <div style="background:#f5f5f5;padding:15px;text-align:center;border-radius:0 0 8px 8px;border:1px solid #e0e0e0;border-top:none;">
            <p style="margin:0;font-size:11px;color:#999;">
                Generated by SafetyPaws — {settings.company_name}
            </p>
        </div>
    </div>
    """
    return html


@api_router.post("/reports/{report_id}/email", response_model=EmailResponse)
async def send_report_email(report_id: str, email_req: EmailRequest):
    report = await db.reports.find_one({"id": report_id})
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    settings = await db.settings.find_one({"id": "app_settings"})
    if not settings:
        settings = AppSettings().model_dump()
    
    settings_obj = AppSettings(**settings)
    report_obj = SiteVisitReport(**report)
    recipient = email_req.recipient_email or settings_obj.default_recipient_email
    
    # Check if SMTP is enabled and configured
    if settings_obj.smtp_enabled and settings_obj.smtp_host and settings_obj.smtp_username and settings_obj.smtp_password:
        try:
            # Generate PDF
            pdf_bytes = generate_pdf(report_obj, settings_obj)
            pdf_filename = f"site_visit_{report_obj.job_no_name}_{report_obj.date}.pdf".replace(" ", "_").replace("/", "-")
            
            # Build email
            subject = f"Site Visit Report — {report_obj.job_no_name} — {report_obj.date}"
            html_body = build_email_html(report_obj, settings_obj)
            
            # Send email
            send_smtp_email(
                smtp_host=settings_obj.smtp_host,
                smtp_port=settings_obj.smtp_port,
                smtp_username=settings_obj.smtp_username,
                smtp_password=settings_obj.smtp_password,
                smtp_use_tls=settings_obj.smtp_use_tls,
                recipient=recipient,
                subject=subject,
                html_body=html_body,
                pdf_bytes=pdf_bytes,
                pdf_filename=pdf_filename,
            )
            
            logger.info(f"Email sent successfully to {recipient} for report {report_id}")
            
            # Update report to mark email as sent
            await db.reports.update_one(
                {"id": report_id},
                {"$set": {"email_sent": True, "email_sent_to": recipient}}
            )
            
            return EmailResponse(
                success=True,
                message=f"Email sent successfully to {recipient}",
                mocked=False,
                recipient=recipient
            )
        except smtplib.SMTPAuthenticationError as e:
            logger.error(f"SMTP authentication failed: {e}")
            raise HTTPException(
                status_code=400, 
                detail="SMTP authentication failed. Check your username and app password in Settings."
            )
        except smtplib.SMTPException as e:
            logger.error(f"SMTP error: {e}")
            raise HTTPException(
                status_code=500, 
                detail=f"Failed to send email: {str(e)}"
            )
        except Exception as e:
            logger.error(f"Email sending error: {e}")
            raise HTTPException(
                status_code=500, 
                detail=f"Failed to send email: {str(e)}"
            )
    else:
        # Mock email sending when SMTP is not configured
        logger.info(f"[MOCK] Email to {recipient} for report {report_id} (SMTP not configured)")
        
        # Update report to mark email as sent (mock)
        await db.reports.update_one(
            {"id": report_id},
            {"$set": {"email_sent": True, "email_sent_to": recipient}}
        )
        
        return EmailResponse(
            success=True,
            message=f"Email simulated to {recipient}. Configure SMTP in Settings to send real emails.",
            mocked=True,
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
