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
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, KeepTogether
from reportlab.lib.units import inch, mm
from reportlab.lib.enums import TA_CENTER, TA_LEFT

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
client = AsyncIOMotorClient(mongo_url)
db_name = os.environ.get('DB_NAME', 'site_reports')
db = client[db_name]

# ================== Default Inspection Items ==================
# Category: structural (Building Consent Inspection), civil, surveying, meeting
DEFAULT_INSPECTION_ITEMS = [
    # Structural - Cupolex Slab
    {"category": "structural", "inspection_type": "Cupolex Slab", "question": "Cupolex Hardware as per documentation?", "answer_type": "yes_no", "options": ""},
    {"category": "structural", "inspection_type": "Cupolex Slab", "question": "Reentrant corner detailing steel?", "answer_type": "yes_no", "options": ""},
    {"category": "structural", "inspection_type": "Cupolex Slab", "question": "Slab mesh steel as per approved BC docs?", "answer_type": "yes_no_select", "options": "SE62, SE72, SE82"},
    {"category": "structural", "inspection_type": "Cupolex Slab", "question": "Edge beam reinforcement as per approved BC docs?", "answer_type": "yes_no_select", "options": "3 D12, 4 D12, 3 D16, 4 D16"},
    {"category": "structural", "inspection_type": "Cupolex Slab", "question": "Penetration detailing steel correct? (D12 steel)", "answer_type": "yes_no", "options": ""},
    {"category": "structural", "inspection_type": "Cupolex Slab", "question": "Shower step down detailing correct?", "answer_type": "yes_no", "options": ""},
    {"category": "structural", "inspection_type": "Cupolex Slab", "question": "Concrete Strength", "answer_type": "select", "options": "20 MPa, 25 MPa, 30 MPa, 32 MPa"},
    {"category": "structural", "inspection_type": "Cupolex Slab", "question": "Dramix fibre reinforcing required?", "answer_type": "yes_no", "options": ""},
    # Structural - Timber Pile
    {"category": "structural", "inspection_type": "Timber Pile", "question": "Bearing Capacity", "answer_type": "select", "options": "> 200 kPa, > 300 kPa"},
    {"category": "structural", "inspection_type": "Timber Pile", "question": "Pile layout as per plan?", "answer_type": "yes_no", "options": ""},
    {"category": "structural", "inspection_type": "Timber Pile", "question": "Hole Diameter (mm)", "answer_type": "select", "options": "400, 450, 500, 600"},
    {"category": "structural", "inspection_type": "Timber Pile", "question": "Hole Depth (mm)", "answer_type": "select", "options": "400, 450, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 1600"},
    {"category": "structural", "inspection_type": "Timber Pile", "question": "Anchor piles provided as per plan?", "answer_type": "yes_no", "options": ""},
    {"category": "structural", "inspection_type": "Timber Pile", "question": "Bearers as per documentation?", "answer_type": "yes_no", "options": ""},
    # Civil - Earthworks
    {"category": "civil", "inspection_type": "Earthworks", "question": "Excavation to correct depth?", "answer_type": "yes_no", "options": ""},
    {"category": "civil", "inspection_type": "Earthworks", "question": "Fill compaction to specification?", "answer_type": "yes_no", "options": ""},
    {"category": "civil", "inspection_type": "Earthworks", "question": "Subgrade preparation adequate?", "answer_type": "yes_no", "options": ""},
    # Civil - Drainage
    {"category": "civil", "inspection_type": "Drainage", "question": "Pipe grade as per design?", "answer_type": "yes_no", "options": ""},
    {"category": "civil", "inspection_type": "Drainage", "question": "Bedding material correct?", "answer_type": "yes_no", "options": ""},
    {"category": "civil", "inspection_type": "Drainage", "question": "Manhole construction compliant?", "answer_type": "yes_no", "options": ""},
    # Surveying
    {"category": "surveying", "inspection_type": "Set-Out", "question": "Boundary pegs verified?", "answer_type": "yes_no", "options": ""},
    {"category": "surveying", "inspection_type": "Set-Out", "question": "Building set-out confirmed?", "answer_type": "yes_no", "options": ""},
    {"category": "surveying", "inspection_type": "Set-Out", "question": "Levels checked to benchmark?", "answer_type": "yes_no", "options": ""},
    {"category": "surveying", "inspection_type": "Level Check", "question": "Floor levels within tolerance?", "answer_type": "yes_no", "options": ""},
    {"category": "surveying", "inspection_type": "Level Check", "question": "Site levels as per plan?", "answer_type": "yes_no", "options": ""},
    # Meeting
    {"category": "meeting", "inspection_type": "Site Meeting", "question": "Design issues discussed?", "answer_type": "yes_no", "options": ""},
    {"category": "meeting", "inspection_type": "Site Meeting", "question": "Construction progress reviewed?", "answer_type": "yes_no", "options": ""},
    {"category": "meeting", "inspection_type": "Site Meeting", "question": "Coordination issues identified?", "answer_type": "yes_no", "options": ""},
    {"category": "meeting", "inspection_type": "Site Meeting", "question": "Changes to works discussed?", "answer_type": "yes_no", "options": ""},
]

# Report purpose definitions
REPORT_PURPOSES = {
    "general_hs": {
        "button_label": "General Site Visit/Health and Safety",
        "formal_purpose": "To observe site conditions and health & safety compliance and ensure we are meeting our obligations on site.",
        "pdf_header": "General Site Visit & Health and Safety Review",
        "pdf_metadata": "Purpose: General site observation and information gathering",
    },
    "civil": {
        "button_label": "Civil Construction Inspection",
        "formal_purpose": "To inspect civil engineering works for general compliance with approved drawings, specifications, and consent conditions.",
        "pdf_header": "Civil Engineering Construction Inspection",
        "pdf_metadata": "Purpose: Civil works compliance inspection",
    },
    "surveying": {
        "button_label": "Surveying / Set-Out",
        "formal_purpose": "To undertake surveying activities including measurement, level verification, or set-out.",
        "pdf_header": "Surveying & Dimensional Verification",
        "pdf_metadata": "Purpose: Surveying and dimensional verification",
    },
    "structural": {
        "button_label": "Structural Inspection",
        "formal_purpose": "To inspect structural elements for general conformance with the structural design documentation and NZ Building Code.",
        "pdf_header": "Structural Engineering Inspection",
        "pdf_metadata": "Purpose: Structural engineering inspection",
    },
    "meeting": {
        "button_label": "Site Meeting",
        "formal_purpose": "To attend an on-site meeting with project stakeholders to discuss design, progress, coordination, or proposed changes.",
        "pdf_header": "On-Site Coordination Meeting",
        "pdf_metadata": "Purpose: On-site coordination meeting",
    },
}

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
    job_address: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)

class StaffMemberCreate(BaseModel):
    name: str

class JobCreate(BaseModel):
    job_number: str
    job_name: str
    job_address: str = ""

class SafetyChecklistItem(BaseModel):
    question: str
    answer: Optional[str] = None  # "yes", "no", "na"
    notes: Optional[str] = None

class InspectionResponse(BaseModel):
    question: str
    answer: str = ""
    detail: Optional[str] = None  # For yes_no_select: the selected option
    answer_type: str = "yes_no"  # yes_no, select, yes_no_select, text

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
    report_purpose: Optional[str] = None  # additional purpose: civil, surveying, structural, meeting
    job_no_name: str
    job_address: str = ""
    departure_office: Optional[str] = None
    estimated_km: Optional[float] = None
    estimated_travel_minutes: Optional[int] = None
    time_on_site_minutes: Optional[int] = None
    total_project_hours: Optional[float] = None
    purpose_of_visit: List[str] = []
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
    # Building Consent Inspection
    building_consent_inspection: bool = False
    inspection_type: Optional[str] = None  # "cupolex" or "timber_pile"
    inspection_notes: Optional[str] = None
    inspection_result: Optional[str] = None  # "approved", "pending", "reinspection"
    evidence_received: bool = False
    evidence_date: Optional[str] = None
    evidence_signature: Optional[str] = None
    evidence_signature_type: Optional[str] = None
    # Timber Pile fields
    timber_bearing_capacity: Optional[str] = None
    timber_pile_layout_as_per_plan: Optional[str] = None
    timber_hole_diameter: Optional[str] = None
    timber_hole_depth: Optional[str] = None
    timber_anchor_piles_as_per_plan: Optional[str] = None
    timber_bearers_as_per_documentation: Optional[str] = None
    # Cupolex Slab fields
    cupolex_hardware_as_per_docs: Optional[str] = None
    cupolex_reentrant_corner_steel: Optional[str] = None
    cupolex_slab_mesh_approved: Optional[str] = None
    cupolex_slab_mesh_type: Optional[str] = None
    cupolex_edge_beam_approved: Optional[str] = None
    cupolex_edge_beam_type: Optional[str] = None
    cupolex_penetration_detailing_correct: Optional[str] = None
    cupolex_shower_step_down_correct: Optional[str] = None
    cupolex_concrete_strength: Optional[str] = None
    cupolex_dramix_fibre_required: Optional[str] = None
    # Dynamic inspection responses (new system)
    inspection_responses: List[InspectionResponse] = []
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
    report_purpose: Optional[str] = None  # additional purpose: civil, surveying, structural, meeting
    job_no_name: str
    job_address: str = ""
    departure_office: Optional[str] = None
    estimated_km: Optional[float] = None
    estimated_travel_minutes: Optional[int] = None
    time_on_site_minutes: Optional[int] = None
    total_project_hours: Optional[float] = None
    purpose_of_visit: List[str] = []
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
    building_consent_inspection: bool = False
    inspection_type: Optional[str] = None
    inspection_notes: Optional[str] = None
    inspection_result: Optional[str] = None
    evidence_received: bool = False
    evidence_date: Optional[str] = None
    evidence_signature: Optional[str] = None
    evidence_signature_type: Optional[str] = None
    timber_bearing_capacity: Optional[str] = None
    timber_pile_layout_as_per_plan: Optional[str] = None
    timber_hole_diameter: Optional[str] = None
    timber_hole_depth: Optional[str] = None
    timber_anchor_piles_as_per_plan: Optional[str] = None
    timber_bearers_as_per_documentation: Optional[str] = None
    cupolex_hardware_as_per_docs: Optional[str] = None
    cupolex_reentrant_corner_steel: Optional[str] = None
    cupolex_slab_mesh_approved: Optional[str] = None
    cupolex_slab_mesh_type: Optional[str] = None
    cupolex_edge_beam_approved: Optional[str] = None
    cupolex_edge_beam_type: Optional[str] = None
    cupolex_penetration_detailing_correct: Optional[str] = None
    cupolex_shower_step_down_correct: Optional[str] = None
    cupolex_concrete_strength: Optional[str] = None
    cupolex_dramix_fibre_required: Optional[str] = None
    inspection_responses: List[Dict[str, Any]] = []
    site_photos: List[SitePhotoCreate] = []
    staff_print_name: str
    signature_data: str
    signature_type: str
    declaration_date: str

class AppSettings(BaseModel):
    id: str = "app_settings"
    default_recipient_email: str = "safetypawsdnl@gmail.com"
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_username: str = "safetypawsdnl@gmail.com"
    smtp_password: str = "jijf wjeg hvwm zdwq"
    smtp_use_tls: bool = True
    smtp_enabled: bool = True
    company_name: str = "Development Nous Limited"
    # External data sync URLs
    staff_csv_url: str = "https://docs.google.com/spreadsheets/d/1IXIYNCBUyP1OHn5sjci-sn2DWq_x1XJiMvgq1YfKz9Y/edit?gid=0#gid=0"
    jobs_csv_url: str = "https://docs.google.com/spreadsheets/d/1xIpraMOCkGG4MUC3CnQ6o7BhyDbHZ0JzKobt7YlPQgw/edit?gid=0#gid=0"
    inspection_items_csv_url: str = "https://docs.google.com/spreadsheets/d/1vUMzitaho6YfckdP2jaj5Dl6x2QcimQ61Fscq0M-wbY/edit?gid=0#gid=0"
    # Office addresses for distance calculation
    hastings_office_address: str = "502 Karamu Road North, Hastings"
    palmerston_north_office_address: str = "168 Grey Street, Palmerston North Central, Palmerston North 4410"
    # Spreadsheet report frequency
    report_frequency: str = "manual"  # "manual", "daily", "weekly", "monthly"
    report_recipient_email: str = ""
    last_report_sent: Optional[datetime] = None
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
    inspection_items_csv_url: Optional[str] = None
    hastings_office_address: Optional[str] = None
    palmerston_north_office_address: Optional[str] = None
    report_frequency: Optional[str] = None
    report_recipient_email: Optional[str] = None

class EmailRequest(BaseModel):
    report_id: str
    recipient_email: Optional[str] = None  # If None, use default

class EmailResponse(BaseModel):
    success: bool
    message: str
    mocked: bool
    recipient: str

# ================== PDF Generation ==================

def generate_pdf(report: SiteVisitReport, settings: AppSettings, purpose_type: str = "general_hs") -> bytes:
    """Generate a PDF from the site visit report. purpose_type controls which sections to include."""
    buffer = BytesIO()
    
    purpose_info = REPORT_PURPOSES.get(purpose_type, REPORT_PURPOSES["general_hs"])
    is_hs = purpose_type == "general_hs"
    
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
    
    # Print margins (8mm = ~23pts)
    MARGIN = 23
    
    def on_first_page(canvas, doc):
        """Draw a print-friendly header with logo on the first page"""
        canvas.saveState()
        # Light green header background (within margins)
        canvas.setFillColor(LIGHT_GREEN)
        canvas.rect(MARGIN, A4[1] - 110, A4[0] - 2*MARGIN, 95, fill=True, stroke=False)
        
        # Green accent line under header
        canvas.setFillColor(GREEN)
        canvas.rect(MARGIN, A4[1] - 113, A4[0] - 2*MARGIN, 3, fill=True, stroke=False)
        
        # Add DNL logo (left side, inside margin)
        logo_path = ROOT_DIR / 'assets' / 'dnl_logo.png'
        if logo_path.exists():
            try:
                canvas.drawImage(str(logo_path), MARGIN + 10, A4[1] - 80, width=120, height=45, preserveAspectRatio=True, mask='auto')
            except Exception:
                pass
        
        # Footer
        canvas.setFillColor(LIGHT_GRAY)
        canvas.rect(MARGIN, MARGIN, A4[0] - 2*MARGIN, 30, fill=True, stroke=False)
        canvas.setFillColor(GREEN)
        canvas.rect(MARGIN, MARGIN + 30, A4[0] - 2*MARGIN, 2, fill=True, stroke=False)
        canvas.setFillColor(GRAY)
        canvas.setFont('Helvetica', 7)
        canvas.drawCentredString(A4[0]/2, MARGIN + 10, f"{settings.company_name}  |  SafetyPaws Site Visit Report  |  {report.date}")
        
        canvas.restoreState()
    
    def on_later_pages(canvas, doc):
        """Footer on subsequent pages"""
        canvas.saveState()
        # Footer
        canvas.setFillColor(LIGHT_GRAY)
        canvas.rect(MARGIN, MARGIN, A4[0] - 2*MARGIN, 30, fill=True, stroke=False)
        canvas.setFillColor(GREEN)
        canvas.rect(MARGIN, MARGIN + 30, A4[0] - 2*MARGIN, 2, fill=True, stroke=False)
        canvas.setFillColor(GRAY)
        canvas.setFont('Helvetica', 7)
        canvas.drawCentredString(A4[0]/2, MARGIN + 10, f"{settings.company_name}  |  SafetyPaws Site Visit Report  |  Page {doc.page}")
        
        canvas.restoreState()
    
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=20*mm,
        leftMargin=20*mm,
        topMargin=120,  # Space for header on first page
        bottomMargin=60  # Space for footer
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
    story.append(Paragraph(f"{report.job_no_name}  —  {report.date}", subtitle_style))
    
    # ---- Site Information ----
    story.append(Paragraph("Site Information", section_style))
    story.append(Spacer(1, 4))
    
    # Add purpose header
    purpose_header = purpose_info["pdf_header"]
    purpose_meta = purpose_info["pdf_metadata"]
    story.insert(0, Spacer(1, 4))
    story.insert(0, Paragraph(purpose_meta, ParagraphStyle('PurposeMeta', parent=normal_style, fontSize=9, textColor=GRAY, alignment=1)))
    story.insert(0, Spacer(1, 2))
    story.insert(0, Paragraph(purpose_header, ParagraphStyle('PurposeTitle', parent=section_style, fontSize=16, textColor=DARK_GREEN, alignment=1)))
    story.insert(0, Spacer(1, 6))
    
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
    if report.job_address:
        site_data.append([Paragraph("<b>Job Address</b>", small_style), Paragraph(report.job_address, normal_style), "", ""])
    if report.departure_office or report.estimated_km:
        office_name = "Hastings" if report.departure_office == "hastings" else "Palmerston North" if report.departure_office == "palmerston_north" else (report.departure_office or "-")
        km_str = f"{report.estimated_km} km" if report.estimated_km else "-"
        site_data.append([Paragraph("<b>Departure Office</b>", small_style), Paragraph(office_name, normal_style),
                          Paragraph("<b>Est. Travel</b>", small_style), Paragraph(km_str, normal_style)])
    if report.total_project_hours is not None or report.time_on_site_minutes is not None:
        on_site = f"{report.time_on_site_minutes} min" if report.time_on_site_minutes else "-"
        travel = f"{report.estimated_travel_minutes} min (return)" if report.estimated_travel_minutes else "-"
        if report.total_project_hours is not None:
            total_min = round(report.total_project_hours * 60)
            total_h = total_min // 60
            total_m = total_min % 60
            total_str = f"{total_h}:{total_m:02d}"
        else:
            total_str = "-"
        site_data.append([Paragraph("<b>Time on Site</b>", small_style), Paragraph(on_site, normal_style),
                          Paragraph("<b>Travel Time</b>", small_style), Paragraph(travel, normal_style)])
        site_data.append([Paragraph("<b>Total Project Time</b>", small_style), Paragraph(total_str, ParagraphStyle('Bold', parent=normal_style, fontName='Helvetica-Bold', textColor=colors.HexColor('#2E7D32'))), "", ""])
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
    
    # Purpose of Visit
    if report.purpose_of_visit and len(report.purpose_of_visit) > 0:
        story.append(Spacer(1, 6))
        purpose_text = ", ".join(report.purpose_of_visit)
        purpose_data = [[Paragraph("<b>Purpose of Visit</b>", small_style)], [Paragraph(purpose_text, normal_style)]]
        purpose_table = Table(purpose_data, colWidths=[440])
        purpose_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), LIGHT_GREEN),
            ('BACKGROUND', (0, 1), (-1, 1), WHITE),
            ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#e0e0e0')),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ]))
        story.append(purpose_table)
    
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
    
    # ---- Risk / Hazard Section (H&S only) ----
    if is_hs:
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
    
    # ---- Inspection / Purpose-Specific Section ----
    if not is_hs:
        has_dynamic = hasattr(report, 'inspection_responses') and report.inspection_responses and len(report.inspection_responses) > 0
        
        if has_dynamic or report.building_consent_inspection:
            story.append(Spacer(1, 8))
            # Dynamic section title based on purpose
            section_title = purpose_info.get("pdf_header", "Inspection Details")
            story.append(Paragraph(section_title, section_style))
            story.append(Spacer(1, 4))
        
            # Check if we have dynamic inspection_responses (new system)
            has_dynamic = hasattr(report, 'inspection_responses') and report.inspection_responses and len(report.inspection_responses) > 0
        
            if has_dynamic:
                # New dynamic system - render from inspection_responses
                insp_type = report.inspection_type or "Not specified"
                type_data = [[Paragraph("<b>Inspection Type</b>", small_style)], [Paragraph(insp_type, normal_style)]]
                type_table = Table(type_data, colWidths=[440])
                type_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), LIGHT_GREEN),
                    ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#e0e0e0')),
                    ('TOPPADDING', (0, 0), (-1, -1), 5),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
                    ('LEFTPADDING', (0, 0), (-1, -1), 8),
                ]))
                story.append(type_table)
                story.append(Spacer(1, 4))
            
                # Build table from dynamic responses
                detail_data = [
                    [Paragraph("<b>Item</b>", ParagraphStyle('DTH', parent=small_style, textColor=WHITE, fontName='Helvetica-Bold')),
                     Paragraph("<b>Value</b>", ParagraphStyle('DTH2', parent=small_style, textColor=WHITE, fontName='Helvetica-Bold'))],
                ]
                for resp in report.inspection_responses:
                    q = resp.get('question', '') if isinstance(resp, dict) else resp.question
                    a = resp.get('answer', '-') if isinstance(resp, dict) else resp.answer
                    d = resp.get('detail', '') if isinstance(resp, dict) else (resp.detail or '')
                    val = a or "-"
                    if d:
                        val += f" ({d})"
                    detail_data.append([
                        Paragraph(q, normal_style),
                        Paragraph(val, normal_style),
                    ])
            
                if len(detail_data) > 1:
                    detail_table = Table(detail_data, colWidths=[220, 220])
                    detail_table.setStyle(TableStyle([
                        ('BACKGROUND', (0, 0), (-1, 0), DARK_GREEN),
                        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#c8e6c9')),
                        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e0e0e0')),
                        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                        ('TOPPADDING', (0, 0), (-1, -1), 4),
                        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                        ('LEFTPADDING', (0, 0), (-1, -1), 6),
                        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [WHITE, colors.HexColor('#f8fdf8')]),
                    ]))
                    story.append(detail_table)
                    story.append(Spacer(1, 4))
            else:
                # Legacy system - render from individual fields
                insp_type = "Cupolex Slab Inspection" if report.inspection_type == "cupolex" else "Timber Pile Inspection" if report.inspection_type == "timber_pile" else report.inspection_type or "Not specified"
                type_data = [[Paragraph("<b>Inspection Type</b>", small_style)], [Paragraph(insp_type, normal_style)]]
                type_table = Table(type_data, colWidths=[440])
                type_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), LIGHT_GREEN),
                    ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#e0e0e0')),
                    ('TOPPADDING', (0, 0), (-1, -1), 5),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
                    ('LEFTPADDING', (0, 0), (-1, -1), 8),
                ]))
                story.append(type_table)
                story.append(Spacer(1, 4))
            
                # Timber pile details (legacy)
                if report.inspection_type == "timber_pile":
                    timber_data = [
                        [Paragraph("<b>Item</b>", ParagraphStyle('TH', parent=small_style, textColor=WHITE, fontName='Helvetica-Bold')),
                         Paragraph("<b>Value</b>", ParagraphStyle('TH2', parent=small_style, textColor=WHITE, fontName='Helvetica-Bold'))],
                        [Paragraph("Bearing Capacity", normal_style), Paragraph(report.timber_bearing_capacity or "-", normal_style)],
                        [Paragraph("Pile Layout as per Plan", normal_style), Paragraph(report.timber_pile_layout_as_per_plan or "-", normal_style)],
                        [Paragraph("Hole Diameter", normal_style), Paragraph(f"{report.timber_hole_diameter} mm" if report.timber_hole_diameter else "-", normal_style)],
                        [Paragraph("Hole Depth", normal_style), Paragraph(f"{report.timber_hole_depth} mm" if report.timber_hole_depth else "-", normal_style)],
                        [Paragraph("Anchor Piles as per Plan", normal_style), Paragraph(report.timber_anchor_piles_as_per_plan or "-", normal_style)],
                        [Paragraph("Bearers as per Documentation", normal_style), Paragraph(report.timber_bearers_as_per_documentation or "-", normal_style)],
                    ]
                    timber_table = Table(timber_data, colWidths=[220, 220])
                    timber_table.setStyle(TableStyle([
                        ('BACKGROUND', (0, 0), (-1, 0), DARK_GREEN),
                        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#c8e6c9')),
                        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e0e0e0')),
                        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                        ('TOPPADDING', (0, 0), (-1, -1), 4),
                        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                        ('LEFTPADDING', (0, 0), (-1, -1), 6),
                        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [WHITE, colors.HexColor('#f8fdf8')]),
                    ]))
                    story.append(timber_table)
                    story.append(Spacer(1, 4))
            
                # Cupolex slab details (legacy)
                if report.inspection_type == "cupolex":
                    mesh_val = f"{report.cupolex_slab_mesh_approved or '-'}"
                    if report.cupolex_slab_mesh_type:
                        mesh_val += f" ({report.cupolex_slab_mesh_type})"
                    edge_val = f"{report.cupolex_edge_beam_approved or '-'}"
                    if report.cupolex_edge_beam_type:
                        edge_val += f" ({report.cupolex_edge_beam_type})"
                    cupolex_data = [
                        [Paragraph("<b>Item</b>", ParagraphStyle('CTH', parent=small_style, textColor=WHITE, fontName='Helvetica-Bold')),
                         Paragraph("<b>Value</b>", ParagraphStyle('CTH2', parent=small_style, textColor=WHITE, fontName='Helvetica-Bold'))],
                        [Paragraph("Cupolex Hardware as per Documentation", normal_style), Paragraph(report.cupolex_hardware_as_per_docs or "-", normal_style)],
                        [Paragraph("Reentrant Corner Detailing Steel", normal_style), Paragraph(report.cupolex_reentrant_corner_steel or "-", normal_style)],
                        [Paragraph("Slab Mesh Steel as per Approved BC Docs", normal_style), Paragraph(mesh_val, normal_style)],
                        [Paragraph("Edge Beam Reinforcement as per Approved BC Docs", normal_style), Paragraph(edge_val, normal_style)],
                        [Paragraph("Penetration Detailing Steel Correct (D12)", normal_style), Paragraph(report.cupolex_penetration_detailing_correct or "-", normal_style)],
                        [Paragraph("Shower Step Down Detailing Correct", normal_style), Paragraph(report.cupolex_shower_step_down_correct or "-", normal_style)],
                        [Paragraph("Concrete Strength", normal_style), Paragraph(report.cupolex_concrete_strength or "-", normal_style)],
                        [Paragraph("Dramix Fibre Reinforcing Required", normal_style), Paragraph(report.cupolex_dramix_fibre_required or "-", normal_style)],
                    ]
                    cupolex_table = Table(cupolex_data, colWidths=[220, 220])
                    cupolex_table.setStyle(TableStyle([
                        ('BACKGROUND', (0, 0), (-1, 0), DARK_GREEN),
                        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#c8e6c9')),
                        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e0e0e0')),
                        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                        ('TOPPADDING', (0, 0), (-1, -1), 4),
                        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                        ('LEFTPADDING', (0, 0), (-1, -1), 6),
                        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [WHITE, colors.HexColor('#f8fdf8')]),
                    ]))
                    story.append(cupolex_table)
                    story.append(Spacer(1, 4))
        
            if report.inspection_notes:
                notes_data = [[Paragraph("<b>Inspection Notes</b>", small_style)], [Paragraph(report.inspection_notes, normal_style)]]
                notes_table = Table(notes_data, colWidths=[440])
                notes_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), LIGHT_GREEN),
                    ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#e0e0e0')),
                    ('TOPPADDING', (0, 0), (-1, -1), 5),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
                    ('LEFTPADDING', (0, 0), (-1, -1), 8),
                ]))
                story.append(notes_table)
                story.append(Spacer(1, 6))
        
            # Inspection result
            if report.inspection_result:
                if report.inspection_result == 'approved':
                    result_text = "INSPECTION APPROVED — OK TO PROCEED"
                    result_color = DARK_GREEN
                    result_bg = LIGHT_GREEN
                    border_color = GREEN
                elif report.inspection_result == 'pending':
                    result_text = "INSPECTION APPROVAL PENDING COMPLETION OF ABOVE"
                    result_color = colors.HexColor('#E65100')
                    result_bg = colors.HexColor('#FFF3E0')
                    border_color = ORANGE
                else:
                    result_text = "REINSPECTION REQUIRED"
                    result_color = colors.HexColor('#C62828')
                    result_bg = colors.HexColor('#FFEBEE')
                    border_color = RED
            
                result_style = ParagraphStyle(
                    'InspResult',
                    parent=normal_style,
                    fontSize=11,
                    fontName='Helvetica-Bold',
                    textColor=result_color,
                    alignment=TA_CENTER
                )
                result_data = [[Paragraph(result_text, result_style)]]
                result_table = Table(result_data, colWidths=[440])
                result_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, -1), result_bg),
                    ('BOX', (0, 0), (-1, -1), 2, border_color),
                    ('TOPPADDING', (0, 0), (-1, -1), 10),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
                ]))
                story.append(result_table)
            
                # Pending sub-fields
                if report.inspection_result == 'pending':
                    story.append(Spacer(1, 6))
                    pending_items = []
                    evidence_text = "Evidence of work completion received: "
                    evidence_text += "YES" if report.evidence_received else "NO"
                    pending_items.append(Paragraph(f"<b>{evidence_text}</b>", normal_style))
                    if report.evidence_date:
                        pending_items.append(Paragraph(f"<b>Date:</b> {report.evidence_date}", normal_style))
                    if report.evidence_signature:
                        pending_items.append(Paragraph(f"<b>Signed:</b> {report.evidence_signature}", normal_style))
                
                    for item in pending_items:
                        story.append(item)
                        story.append(Spacer(1, 2))
    
    # ---- Declaration (keep together on one page) ----
    declaration_elements = []
    declaration_elements.append(Spacer(1, 8))
    declaration_elements.append(Paragraph("Declaration", section_style))
    declaration_elements.append(Spacer(1, 4))
    
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
    declaration_elements.append(decl_box)
    declaration_elements.append(Spacer(1, 8))
    
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
    declaration_elements.append(decl_table)
    declaration_elements.append(Spacer(1, 8))
    
    # Signature
    declaration_elements.append(Paragraph("<b>Signature:</b>", normal_style))
    if report.signature_data:
        try:
            if report.signature_type == "drawn":
                sig_data = report.signature_data
                if "," in sig_data:
                    sig_data = sig_data.split(",")[1]
                sig_bytes = base64.b64decode(sig_data)
                sig_buffer = BytesIO(sig_bytes)
                sig_img = Image(sig_buffer, width=2*inch, height=0.6*inch)
                declaration_elements.append(sig_img)
            else:
                sig_style = ParagraphStyle(
                    'Signature',
                    parent=styles['Normal'],
                    fontSize=16,
                    fontName='Times-Italic',
                    textColor=colors.HexColor('#1a237e')
                )
                declaration_elements.append(Paragraph(report.signature_data, sig_style))
        except Exception as e:
            logger.error(f"Error adding signature: {e}")
            declaration_elements.append(Paragraph(f"[Signature: {report.staff_print_name}]", normal_style))
    
    # Wrap entire declaration in KeepTogether
    story.append(KeepTogether(declaration_elements))
    
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
    inspection_items_count: int = 0

@api_router.post("/sync", response_model=SyncResponse)
async def sync_from_csv():
    """Sync staff and jobs from external CSV URLs configured in settings"""
    settings = await db.settings.find_one({"id": "app_settings"})
    if not settings:
        settings = AppSettings().model_dump()
    
    staff_count = 0
    jobs_count = 0
    errors = []
    
    def convert_google_sheets_url(url: str) -> str:
        """Convert various Google Sheets URL formats to CSV export URL"""
        import re
        url = url.strip()
        
        # Already a CSV export URL
        if 'export?format=csv' in url or 'output=csv' in url:
            return url
        
        # Extract sheet ID from various Google Sheets URL formats
        # Format: https://docs.google.com/spreadsheets/d/{ID}/...
        match = re.search(r'/spreadsheets/d/([a-zA-Z0-9_-]+)', url)
        if match:
            sheet_id = match.group(1)
            # Check for gid parameter
            gid_match = re.search(r'gid=(\d+)', url)
            gid = gid_match.group(1) if gid_match else '0'
            return f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&gid={gid}"
        
        # Not a Google Sheets URL, return as-is
        return url
    
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as http_client:
        # Sync Staff from CSV
        if settings.get('staff_csv_url'):
            try:
                csv_url = convert_google_sheets_url(settings['staff_csv_url'])
                logger.info(f"Syncing staff from: {csv_url}")
                
                response = await http_client.get(csv_url)
                response.raise_for_status()
                
                # Parse CSV
                content = response.text
                logger.info(f"Staff CSV content (first 200 chars): {content[:200]}")
                
                reader = csv.DictReader(content.splitlines())
                
                # Clear existing staff and add new ones
                await db.staff.delete_many({})
                
                for row in reader:
                    # Support many column name variations
                    name = (row.get('name') or row.get('Name') or row.get('staff_name') or 
                            row.get('Staff Name') or row.get('Staff') or row.get('staff') or
                            row.get('Employee') or row.get('employee') or row.get('Full Name') or
                            row.get('full_name') or '')
                    # If no known column, try the first column
                    if not name.strip() and row:
                        first_val = list(row.values())[0]
                        if first_val and first_val.strip():
                            name = first_val
                    
                    if name and name.strip():
                        staff_obj = StaffMember(name=name.strip())
                        await db.staff.insert_one(staff_obj.model_dump())
                        staff_count += 1
                        
                logger.info(f"Synced {staff_count} staff members from CSV")
            except httpx.HTTPStatusError as e:
                logger.error(f"HTTP error syncing staff CSV: {e.response.status_code}")
                errors.append(f"Staff sync failed: HTTP {e.response.status_code}. Make sure the spreadsheet is shared as 'Anyone with the link'")
            except Exception as e:
                logger.error(f"Error syncing staff CSV: {e}")
                errors.append(f"Staff sync failed: {str(e)}")
        
        # Sync Jobs from CSV
        if settings.get('jobs_csv_url'):
            try:
                csv_url = convert_google_sheets_url(settings['jobs_csv_url'])
                logger.info(f"Syncing jobs from: {csv_url}")
                
                response = await http_client.get(csv_url)
                response.raise_for_status()
                
                # Parse CSV
                content = response.text
                logger.info(f"Jobs CSV content (first 200 chars): {content[:200]}")
                
                reader = csv.DictReader(content.splitlines())
                
                # Clear existing jobs and add new ones
                await db.jobs.delete_many({})
                
                for row in reader:
                    # Support many column name variations
                    job_number = (row.get('job_number') or row.get('Job Number') or row.get('number') or 
                                  row.get('Number') or row.get('Job No') or row.get('Job no') or
                                  row.get('job_no') or row.get('Job') or row.get('job') or
                                  row.get('ID') or row.get('id') or '')
                    job_name = (row.get('job_name') or row.get('Job Name') or row.get('name') or 
                                row.get('Name') or row.get('Description') or row.get('description') or
                                row.get('Project') or row.get('project') or row.get('Title') or '')
                    
                    # If no known columns, try first two columns
                    if not job_number.strip() and row:
                        vals = list(row.values())
                        if len(vals) >= 1 and vals[0] and vals[0].strip():
                            job_number = vals[0]
                        if len(vals) >= 2 and vals[1] and vals[1].strip():
                            job_name = vals[1]
                    
                    if job_number and job_number.strip():
                        # Get address from column C or known names
                        job_address = (row.get('job_address') or row.get('Job Address') or row.get('address') or
                                       row.get('Address') or row.get('Site Address') or row.get('site_address') or
                                       row.get('Location') or row.get('location') or '')
                        # If no known column, try third column
                        if not job_address.strip() and row:
                            vals = list(row.values())
                            if len(vals) >= 3 and vals[2] and vals[2].strip():
                                job_address = vals[2]
                        
                        job_obj = Job(
                            job_number=job_number.strip(),
                            job_name=(job_name or '').strip(),
                            job_address=(job_address or '').strip()
                        )
                        await db.jobs.insert_one(job_obj.model_dump())
                        jobs_count += 1
                        
                logger.info(f"Synced {jobs_count} jobs from CSV")
            except httpx.HTTPStatusError as e:
                logger.error(f"HTTP error syncing jobs CSV: {e.response.status_code}")
                errors.append(f"Jobs sync failed: HTTP {e.response.status_code}. Make sure the spreadsheet is shared as 'Anyone with the link'")
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

# ================== Inspection Items Endpoints ==================

@api_router.get("/inspection-items")
async def get_inspection_items(category: str = None):
    """Get inspection items grouped by inspection type. Falls back to defaults if none synced."""
    query = {}
    if category:
        query["category"] = category
    
    items = await db.inspection_items.find(query, {"_id": 0}).to_list(500)
    if not items:
        # Use defaults, filtered by category if specified
        items = DEFAULT_INSPECTION_ITEMS
        if category:
            items = [i for i in items if i.get("category") == category]
    
    # Group by inspection_type
    grouped = {}
    for item in items:
        insp_type = item.get("inspection_type", "Unknown")
        if insp_type not in grouped:
            grouped[insp_type] = []
        grouped[insp_type].append({
            "question": item.get("question", ""),
            "answer_type": item.get("answer_type", "yes_no"),
            "options": item.get("options", ""),
        })
    
    types = list(grouped.keys())
    return {"types": types, "items": grouped}

@api_router.get("/report-purposes")
async def get_report_purposes():
    """Get available report purpose types"""
    return REPORT_PURPOSES

@api_router.post("/sync-inspection-items")
async def sync_inspection_items():
    """Sync inspection items from the configured Google Sheets URL"""
    settings = await db.settings.find_one({"id": "app_settings"})
    if not settings:
        settings = AppSettings().model_dump()
    
    csv_url_raw = settings.get('inspection_items_csv_url', '')
    if not csv_url_raw or not csv_url_raw.strip():
        return {"success": False, "message": "No inspection items spreadsheet URL configured", "count": 0}
    
    import re
    def convert_google_sheets_url(url: str) -> str:
        url = url.strip()
        if 'export?format=csv' in url or 'output=csv' in url:
            return url
        match = re.search(r'/spreadsheets/d/([a-zA-Z0-9_-]+)', url)
        if match:
            sheet_id = match.group(1)
            gid_match = re.search(r'gid=(\d+)', url)
            gid = gid_match.group(1) if gid_match else '0'
            return f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&gid={gid}"
        return url
    
    try:
        csv_url = convert_google_sheets_url(csv_url_raw)
        logger.info(f"Syncing inspection items from: {csv_url}")
        
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as http_client:
            response = await http_client.get(csv_url)
            response.raise_for_status()
            
            content = response.text
            logger.info(f"Inspection items CSV content (first 300 chars): {content[:300]}")
            
            reader = csv.DictReader(content.splitlines())
            
            await db.inspection_items.delete_many({})
            count = 0
            
            for row in reader:
                inspection_type = (row.get('Inspection Type') or row.get('inspection_type') or
                                   row.get('Type') or row.get('type') or '')
                question = (row.get('Question') or row.get('question') or
                           row.get('Item') or row.get('item') or '')
                answer_type = (row.get('Answer Type') or row.get('answer_type') or
                              row.get('Type of Answer') or row.get('Answer') or 'yes_no')
                options = (row.get('Options') or row.get('options') or
                          row.get('Choices') or row.get('choices') or '')
                category = (row.get('Category') or row.get('category') or 'structural')
                
                # If no known columns, try positional
                if not inspection_type.strip() and row:
                    vals = list(row.values())
                    if len(vals) >= 1:
                        category = vals[0] or 'structural'
                    if len(vals) >= 2:
                        inspection_type = vals[1] or ''
                    if len(vals) >= 3:
                        question = vals[2] or ''
                    if len(vals) >= 4:
                        answer_type = vals[3] or 'yes_no'
                    if len(vals) >= 5:
                        options = vals[4] or ''
                
                if inspection_type.strip() and question.strip():
                    # Normalize answer_type
                    at = answer_type.strip().lower().replace(' ', '_')
                    if at not in ('yes_no', 'select', 'yes_no_select', 'text'):
                        at = 'yes_no'
                    
                    cat = category.strip().lower()
                    if cat not in ('structural', 'civil', 'surveying', 'meeting'):
                        cat = 'structural'
                    
                    await db.inspection_items.insert_one({
                        "category": cat,
                        "inspection_type": inspection_type.strip(),
                        "question": question.strip(),
                        "answer_type": at,
                        "options": options.strip(),
                    })
                    count += 1
            
            logger.info(f"Synced {count} inspection items from CSV")
            return {"success": True, "message": f"Synced {count} inspection items", "count": count}
    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP error syncing inspection items: {e.response.status_code}")
        return {"success": False, "message": f"HTTP {e.response.status_code}. Make sure the spreadsheet is shared as 'Anyone with the link'", "count": 0}
    except Exception as e:
        logger.error(f"Error syncing inspection items: {e}")
        return {"success": False, "message": str(e), "count": 0}

# Geocoding endpoint for address validation
@api_router.get("/geocode")
async def geocode_address(address: str):
    """Validate an address and return coordinates using OpenStreetMap Nominatim"""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params={
                    "q": address,
                    "format": "json",
                    "limit": 5,
                    "addressdetails": 1,
                },
                headers={"User-Agent": "SafetyPaws/1.0"}
            )
            response.raise_for_status()
            results = response.json()
            
            if not results:
                return {"valid": False, "results": [], "message": "No matching addresses found"}
            
            formatted = []
            for r in results:
                formatted.append({
                    "display_name": r.get("display_name", ""),
                    "latitude": float(r.get("lat", 0)),
                    "longitude": float(r.get("lon", 0)),
                    "type": r.get("type", ""),
                    "importance": r.get("importance", 0),
                })
            
            return {"valid": True, "results": formatted}
    except Exception as e:
        logger.error(f"Geocoding error: {e}")
        return {"valid": False, "results": [], "message": str(e)}

@api_router.get("/estimate-distance")
async def estimate_distance(office: str, job_address: str):
    """Estimate driving distance in km from office to job address using OSRM"""
    try:
        # Get office address from settings
        settings = await db.settings.find_one({"id": "app_settings"})
        if not settings:
            settings = AppSettings().model_dump()
        settings_obj = AppSettings(**settings)
        
        if office == "hastings":
            office_address = settings_obj.hastings_office_address
        elif office == "palmerston_north":
            office_address = settings_obj.palmerston_north_office_address
        else:
            return {"success": False, "message": "Unknown office", "km": None}
        
        # Geocode both addresses
        async with httpx.AsyncClient(timeout=15.0) as client:
            # Geocode office
            office_resp = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params={"q": office_address, "format": "json", "limit": 1},
                headers={"User-Agent": "SafetyPaws/1.0"}
            )
            office_results = office_resp.json()
            if not office_results:
                return {"success": False, "message": f"Could not geocode office address: {office_address}", "km": None}
            
            office_lat = float(office_results[0]["lat"])
            office_lon = float(office_results[0]["lon"])
            
            # Small delay to respect Nominatim rate limit
            import asyncio
            await asyncio.sleep(1.1)
            
            # Geocode job address
            job_resp = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params={"q": job_address, "format": "json", "limit": 1},
                headers={"User-Agent": "SafetyPaws/1.0"}
            )
            job_results = job_resp.json()
            if not job_results:
                return {"success": False, "message": f"Could not geocode job address: {job_address}", "km": None}
            
            job_lat = float(job_results[0]["lat"])
            job_lon = float(job_results[0]["lon"])
            
            # Use OSRM for driving distance
            osrm_url = f"http://router.project-osrm.org/route/v1/driving/{office_lon},{office_lat};{job_lon},{job_lat}"
            route_resp = await client.get(osrm_url, params={"overview": "false"})
            route_data = route_resp.json()
            
            if route_data.get("code") == "Ok" and route_data.get("routes"):
                distance_m = route_data["routes"][0]["distance"]
                distance_km = round(distance_m / 1000, 1)
                duration_s = route_data["routes"][0]["duration"]
                duration_min = round(duration_s / 60)
                
                return {
                    "success": True,
                    "km": distance_km,
                    "duration_minutes": duration_min,
                    "office_address": office_address,
                    "message": f"{distance_km} km ({duration_min} min drive)"
                }
            else:
                # Fallback: use geopy geodesic distance with road factor
                from geopy.distance import geodesic
                straight_line = geodesic((office_lat, office_lon), (job_lat, job_lon)).km
                estimated_road = round(straight_line * 1.3, 1)
                return {
                    "success": True,
                    "km": estimated_road,
                    "duration_minutes": None,
                    "office_address": office_address,
                    "message": f"~{estimated_road} km (estimated)"
                }
    except Exception as e:
        logger.error(f"Distance estimation error: {e}")
        return {"success": False, "message": str(e), "km": None}

# Settings endpoints
@api_router.get("/settings", response_model=AppSettings)
async def get_settings():
    settings = await db.settings.find_one({"id": "app_settings"})
    if not settings:
        default_settings = AppSettings()
        await db.settings.insert_one(default_settings.model_dump())
        return default_settings
    
    # Merge with defaults: fill in any empty/missing fields from AppSettings defaults
    defaults = AppSettings().model_dump()
    stored = {k: v for k, v in settings.items() if k != '_id'}
    for key, default_val in defaults.items():
        if key not in stored or stored[key] is None or stored[key] == '':
            stored[key] = default_val
    
    # Update the DB with merged values so future fetches are consistent
    await db.settings.update_one(
        {"id": "app_settings"},
        {"$set": stored},
        upsert=True
    )
    
    return AppSettings(**stored)

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
    pdf_bytes: bytes = None,
    pdf_filename: str = None,
    attachments: list = None,  # List of (bytes, filename, mime_subtype) tuples
    additional_attachments: list = None,  # List of (bytes, filename) tuples for extra PDFs
) -> None:
    """Send an email with attachments via SMTP (Gmail compatible)"""
    msg = MIMEMultipart('mixed')
    msg['From'] = smtp_username
    msg['To'] = recipient
    msg['Subject'] = subject

    # Attach HTML body
    html_part = MIMEText(html_body, 'html')
    msg.attach(html_part)

    # Attach PDF if provided
    if pdf_bytes and pdf_filename:
        pdf_part = MIMEApplication(pdf_bytes, _subtype='pdf')
        pdf_part.add_header('Content-Disposition', 'attachment', filename=pdf_filename)
        msg.attach(pdf_part)
    
    # Attach additional PDFs
    if additional_attachments:
        for extra_bytes, extra_filename in additional_attachments:
            extra_part = MIMEApplication(extra_bytes, _subtype='pdf')
            extra_part.add_header('Content-Disposition', 'attachment', filename=extra_filename)
            msg.attach(extra_part)
    
    # Attach additional files
    if attachments:
        for file_bytes, filename, subtype in attachments:
            part = MIMEApplication(file_bytes, _subtype=subtype)
            part.add_header('Content-Disposition', 'attachment', filename=filename)
            msg.attach(part)

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
                <tr>
                    <td style="padding:6px 0;color:#666;font-size:13px;"><strong>Purpose of Visit:</strong></td>
                    <td style="padding:6px 0;font-size:13px;">{', '.join(report.purpose_of_visit) if report.purpose_of_visit else 'Not specified'}</td>
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
            # Always generate H&S PDF
            hs_pdf_bytes = generate_pdf(report_obj, settings_obj, "general_hs")
            hs_filename = f"HS_Report_{report_obj.job_no_name}_{report_obj.date}.pdf".replace(" ", "_").replace("/", "-")
            
            # Generate purpose-specific PDF if applicable
            additional_pdfs = []
            if report_obj.report_purpose and report_obj.report_purpose != "general_hs":
                purpose_pdf = generate_pdf(report_obj, settings_obj, report_obj.report_purpose)
                purpose_info = REPORT_PURPOSES.get(report_obj.report_purpose, {})
                purpose_label = purpose_info.get("pdf_header", "Report").replace(" ", "_").replace("/", "-")
                purpose_filename = f"{purpose_label}_{report_obj.job_no_name}_{report_obj.date}.pdf".replace(" ", "_").replace("/", "-")
                additional_pdfs.append((purpose_pdf, purpose_filename))
            
            # Build email
            subject = f"Site Visit Report — {report_obj.job_no_name} — {report_obj.date}"
            html_body = build_email_html(report_obj, settings_obj)
            
            # Send email with all PDFs
            send_smtp_email(
                smtp_host=settings_obj.smtp_host,
                smtp_port=settings_obj.smtp_port,
                smtp_username=settings_obj.smtp_username,
                smtp_password=settings_obj.smtp_password,
                smtp_use_tls=settings_obj.smtp_use_tls,
                recipient=recipient,
                subject=subject,
                html_body=html_body,
                pdf_bytes=hs_pdf_bytes,
                pdf_filename=hs_filename,
                additional_attachments=additional_pdfs,
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

# ================== Email Photos Endpoint ==================

@api_router.post("/reports/{report_id}/email-photos", response_model=EmailResponse)
async def email_report_photos(report_id: str, email_req: EmailRequest):
    """Email all site photos as individual attachments"""
    report = await db.reports.find_one({"id": report_id})
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    settings = await db.settings.find_one({"id": "app_settings"})
    if not settings:
        settings = AppSettings().model_dump()
    
    settings_obj = AppSettings(**settings)
    report_obj = SiteVisitReport(**report)
    recipient = email_req.recipient_email or settings_obj.default_recipient_email
    
    if not report_obj.site_photos or len(report_obj.site_photos) == 0:
        return EmailResponse(success=False, message="No photos to send", mocked=False, recipient=recipient)
    
    # Extract job number for subject
    job_number = report_obj.job_no_name.split(' - ')[0] if ' - ' in report_obj.job_no_name else report_obj.job_no_name
    
    if settings_obj.smtp_enabled and settings_obj.smtp_host and settings_obj.smtp_username and settings_obj.smtp_password:
        try:
            # Build photo attachments
            attachments = []
            for i, photo in enumerate(report_obj.site_photos):
                photo_data = photo.base64_data
                if "," in photo_data:
                    photo_data = photo_data.split(",")[1]
                photo_bytes = base64.b64decode(photo_data)
                
                # Get photo name from caption
                photo_name = f"{job_number}-{i+1}"
                if photo.caption:
                    caption_name = photo.caption.split('\n')[0]
                    if caption_name:
                        photo_name = caption_name
                
                attachments.append((photo_bytes, f"{photo_name}.jpg", "jpeg"))
            
            # Build simple HTML body
            html_body = f"""
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                <h2 style="color:#4CAF50;">Site Visit Photos — {job_number}</h2>
                <p><strong>Job:</strong> {report_obj.job_no_name}</p>
                <p><strong>Date:</strong> {report_obj.date}</p>
                <p><strong>Staff:</strong> {report_obj.staff_members}</p>
                <p>{len(attachments)} photo(s) attached.</p>
                <hr style="border:1px solid #e0e0e0;">
                <p style="color:#999;font-size:12px;">SafetyPaws — {settings_obj.company_name}</p>
            </div>
            """
            
            send_smtp_email(
                smtp_host=settings_obj.smtp_host,
                smtp_port=settings_obj.smtp_port,
                smtp_username=settings_obj.smtp_username,
                smtp_password=settings_obj.smtp_password,
                smtp_use_tls=settings_obj.smtp_use_tls,
                recipient=recipient,
                subject=f"{job_number} — Site Visit Photos — {report_obj.date}",
                html_body=html_body,
                attachments=attachments,
            )
            
            logger.info(f"Photos emailed to {recipient} for report {report_id} ({len(attachments)} photos)")
            return EmailResponse(success=True, message=f"{len(attachments)} photos sent to {recipient}", mocked=False, recipient=recipient)
        except Exception as e:
            logger.error(f"Photo email error: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to email photos: {str(e)}")
    else:
        return EmailResponse(success=True, message=f"Photos would be sent to {recipient} (SMTP not configured)", mocked=True, recipient=recipient)


# ================== Spreadsheet Report ==================

def generate_reports_csv(reports: list) -> bytes:
    """Generate a CSV spreadsheet from all site visit reports"""
    output = BytesIO()
    import io
    text_output = io.StringIO()
    
    fieldnames = [
        'Date', 'Staff Members', 'Job Number/Name', 'Job Address', 'Purpose of Visit',
        'Site Description', 'Weather', 'Arrival Time', 'Departure Time',
        'Contractor', 'Risks/Hazards/Incidents', 'Toolbox Talk Required', 'Toolbox Talk Notes',
        'Checklist Comments',
    ]
    
    # Add safety checklist columns
    checklist_questions = [
        'PPE Available', 'Hazards Identified', 'Safety Barriers', 'First Aid Kit',
        'Emergency Procedures', 'Work Permits', 'Electrical Equipment Safe',
        'Manual Handling Safe', 'Environmental Controls', 'Site Tidy'
    ]
    for q in checklist_questions:
        fieldnames.append(f"Safety: {q}")
        fieldnames.append(f"Safety Notes: {q}")
    
    fieldnames.extend([
        'Building Consent Inspection', 'Inspection Notes', 'Inspection Result',
        'Evidence Received', 'Evidence Date',
        'Number of Photos', 'Signature Name', 'Declaration Date',
        'Email Sent', 'Email Sent To', 'Created At'
    ])
    
    writer = csv.DictWriter(text_output, fieldnames=fieldnames)
    writer.writeheader()
    
    for report in reports:
        row = {
            'Date': report.get('date', ''),
            'Staff Members': report.get('staff_members', ''),
            'Job Number/Name': report.get('job_no_name', ''),
            'Job Address': report.get('job_address', ''),
            'Purpose of Visit': ', '.join(report.get('purpose_of_visit', [])),
            'Site Description': report.get('site_description', ''),
            'Weather': report.get('weather_conditions', ''),
            'Arrival Time': report.get('site_arrival_time', ''),
            'Departure Time': report.get('site_departure_time', ''),
            'Contractor': report.get('contractor_responsible', ''),
            'Risks/Hazards/Incidents': report.get('risks_hazards_incidents', ''),
            'Toolbox Talk Required': 'Yes' if report.get('toolbox_talk_required') else 'No',
            'Toolbox Talk Notes': report.get('toolbox_talk_notes', ''),
            'Checklist Comments': report.get('checklist_comments', ''),
            'Building Consent Inspection': 'Yes' if report.get('building_consent_inspection') else 'No',
            'Inspection Notes': report.get('inspection_notes', ''),
            'Inspection Result': report.get('inspection_result', ''),
            'Evidence Received': 'Yes' if report.get('evidence_received') else 'No',
            'Evidence Date': report.get('evidence_date', ''),
            'Number of Photos': len(report.get('site_photos', [])),
            'Signature Name': report.get('staff_print_name', ''),
            'Declaration Date': report.get('declaration_date', ''),
            'Email Sent': 'Yes' if report.get('email_sent') else 'No',
            'Email Sent To': report.get('email_sent_to', ''),
            'Created At': str(report.get('created_at', '')),
        }
        
        # Add checklist data
        checklist = report.get('safety_checklist', [])
        for i, q in enumerate(checklist_questions):
            if i < len(checklist):
                item = checklist[i]
                ans = item.get('answer', '') if isinstance(item, dict) else ''
                notes = item.get('notes', '') if isinstance(item, dict) else ''
                row[f"Safety: {q}"] = ans.upper() if ans else ''
                row[f"Safety Notes: {q}"] = notes
            else:
                row[f"Safety: {q}"] = ''
                row[f"Safety Notes: {q}"] = ''
        
        writer.writerow(row)
    
    csv_content = text_output.getvalue()
    return csv_content.encode('utf-8')


@api_router.post("/reports/spreadsheet-email")
async def email_spreadsheet_report(recipient_email: Optional[str] = None):
    """Generate and email a spreadsheet of all site visit reports"""
    settings = await db.settings.find_one({"id": "app_settings"})
    if not settings:
        settings = AppSettings().model_dump()
    
    settings_obj = AppSettings(**settings)
    recipient = recipient_email or settings_obj.report_recipient_email or settings_obj.default_recipient_email
    
    # Get all reports
    reports = await db.reports.find().sort("created_at", -1).to_list(1000)
    
    if not reports:
        return {"success": False, "message": "No reports to include in spreadsheet"}
    
    if settings_obj.smtp_enabled and settings_obj.smtp_host and settings_obj.smtp_username and settings_obj.smtp_password:
        try:
            csv_bytes = generate_reports_csv(reports)
            
            from datetime import datetime as dt
            today = dt.utcnow().strftime('%Y-%m-%d')
            
            html_body = f"""
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                <h2 style="color:#4CAF50;">Site Visit Report Summary</h2>
                <p><strong>Company:</strong> {settings_obj.company_name}</p>
                <p><strong>Date Generated:</strong> {today}</p>
                <p><strong>Total Reports:</strong> {len(reports)}</p>
                <p>The attached CSV spreadsheet contains all site visit report data in tabular form. You can open it in Excel or Google Sheets.</p>
                <hr style="border:1px solid #e0e0e0;">
                <p style="color:#999;font-size:12px;">SafetyPaws — Automated Report</p>
            </div>
            """
            
            send_smtp_email(
                smtp_host=settings_obj.smtp_host,
                smtp_port=settings_obj.smtp_port,
                smtp_username=settings_obj.smtp_username,
                smtp_password=settings_obj.smtp_password,
                smtp_use_tls=settings_obj.smtp_use_tls,
                recipient=recipient,
                subject=f"Site Visit Reports — {settings_obj.company_name} — {today}",
                html_body=html_body,
                attachments=[(csv_bytes, f"site_visits_{today}.csv", "csv")],
            )
            
            # Update last sent timestamp
            await db.settings.update_one(
                {"id": "app_settings"},
                {"$set": {"last_report_sent": dt.utcnow()}}
            )
            
            logger.info(f"Spreadsheet report emailed to {recipient} ({len(reports)} reports)")
            return {"success": True, "message": f"Spreadsheet with {len(reports)} reports sent to {recipient}", "recipient": recipient}
        except Exception as e:
            logger.error(f"Spreadsheet email error: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to send spreadsheet: {str(e)}")
    else:
        return {"success": False, "message": "SMTP not configured. Enable SMTP in Settings to send spreadsheet reports."}


# ================== Background Scheduler ==================

import asyncio
from contextlib import asynccontextmanager

async def check_scheduled_reports():
    """Check if scheduled reports need to be sent"""
    while True:
        try:
            await asyncio.sleep(3600)  # Check every hour
            settings = await db.settings.find_one({"id": "app_settings"})
            if not settings:
                continue
            
            settings_obj = AppSettings(**settings)
            
            if settings_obj.report_frequency == "manual" or not settings_obj.smtp_enabled:
                continue
            
            from datetime import datetime as dt, timedelta
            now = dt.utcnow()
            last_sent = settings_obj.last_report_sent
            
            should_send = False
            if not last_sent:
                should_send = True
            elif settings_obj.report_frequency == "daily" and (now - last_sent) > timedelta(hours=24):
                should_send = True
            elif settings_obj.report_frequency == "weekly" and (now - last_sent) > timedelta(days=7):
                should_send = True
            elif settings_obj.report_frequency == "monthly" and (now - last_sent) > timedelta(days=30):
                should_send = True
            
            if should_send:
                recipient = settings_obj.report_recipient_email or settings_obj.default_recipient_email
                reports = await db.reports.find().sort("created_at", -1).to_list(1000)
                
                if reports:
                    csv_bytes = generate_reports_csv(reports)
                    today = now.strftime('%Y-%m-%d')
                    
                    html_body = f"""
                    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                        <h2 style="color:#4CAF50;">Scheduled Site Visit Report Summary</h2>
                        <p><strong>Frequency:</strong> {settings_obj.report_frequency.capitalize()}</p>
                        <p><strong>Total Reports:</strong> {len(reports)}</p>
                        <p>Attached CSV contains all site visit data.</p>
                        <hr style="border:1px solid #e0e0e0;">
                        <p style="color:#999;font-size:12px;">SafetyPaws — {settings_obj.company_name}</p>
                    </div>
                    """
                    
                    send_smtp_email(
                        smtp_host=settings_obj.smtp_host,
                        smtp_port=settings_obj.smtp_port,
                        smtp_username=settings_obj.smtp_username,
                        smtp_password=settings_obj.smtp_password,
                        smtp_use_tls=settings_obj.smtp_use_tls,
                        recipient=recipient,
                        subject=f"Scheduled Report — {settings_obj.company_name} — {today}",
                        html_body=html_body,
                        attachments=[(csv_bytes, f"site_visits_{today}.csv", "csv")],
                    )
                    
                    await db.settings.update_one(
                        {"id": "app_settings"},
                        {"$set": {"last_report_sent": now}}
                    )
                    logger.info(f"Scheduled {settings_obj.report_frequency} report sent to {recipient}")
                    
        except Exception as e:
            logger.error(f"Scheduled report error: {e}")

@app.on_event("startup")
async def start_scheduler():
    asyncio.create_task(check_scheduled_reports())

# Re-include router after new endpoints
app.include_router(api_router)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
