"""
PDF Generator for Quiz History Reports

Generates a comprehensive learning report showing all quiz sessions
with statistics, session details, and performance metrics.
"""

from io import BytesIO
from typing import Dict, Any
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER


def format_duration(seconds: int) -> str:
    """Format duration from seconds to human-readable format."""
    if not seconds or seconds < 0:
        return "N/A"
    if seconds < 60:
        return f"{seconds}s"
    elif seconds < 3600:
        minutes = seconds // 60
        secs = seconds % 60
        return f"{minutes}m {secs}s"
    else:
        hours = seconds // 3600
        minutes = (seconds % 3600) // 60
        return f"{hours}h {minutes}m"


def calculate_score_percentage(box1: int, box2: int, box3: int) -> float:
    """Calculate success percentage (box1 as % of total)."""
    total = box1 + box2 + box3
    if total == 0:
        return 0.0
    return (box1 / total) * 100


def generate_quiz_history_pdf(
    report_data: Dict[str, Any],
    output_buffer: BytesIO = None
) -> BytesIO:
    """
    Generate a PDF report from quiz history data.

    Args:
        report_data: Dictionary from /api/users/me/learning-report endpoint
        output_buffer: Optional BytesIO buffer to write to

    Returns:
        BytesIO buffer containing the generated PDF
    """
    if output_buffer is None:
        output_buffer = BytesIO()

    # Create PDF document
    doc = SimpleDocTemplate(
        output_buffer,
        pagesize=A4,
        topMargin=2*cm,
        bottomMargin=2*cm,
        leftMargin=2*cm,
        rightMargin=2*cm
    )

    # Styles
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=18,
        textColor=colors.HexColor('#667eea'),
        spaceAfter=12,
        alignment=TA_CENTER,
        fontName='Helvetica-Bold'
    )

    subtitle_style = ParagraphStyle(
        'CustomSubtitle',
        parent=styles['Normal'],
        fontSize=11,
        textColor=colors.HexColor('#7f8c8d'),
        spaceAfter=20,
        alignment=TA_CENTER
    )

    heading_style = ParagraphStyle(
        'SectionHeading',
        parent=styles['Heading2'],
        fontSize=14,
        textColor=colors.HexColor('#2c3e50'),
        spaceAfter=10,
        spaceBefore=15
    )

    # Build content
    story = []

    # Title
    story.append(Paragraph("<b>Quiz History Report</b>", title_style))

    # User info
    user_email = report_data.get('user_email', 'Unknown User')
    user_name = report_data.get('user_name')
    if user_name:
        user_info = f"{user_name} ({user_email})"
    else:
        user_info = user_email
    story.append(Paragraph(user_info, subtitle_style))

    # Date range subtitle
    days = report_data.get('report_period_days', 30)
    story.append(Paragraph(f"Last {days} Days", subtitle_style))
    story.append(Spacer(1, 0.5*cm))

    # Summary Statistics
    story.append(Paragraph("<b>Summary Statistics</b>", heading_style))

    summary = report_data.get('summary', {})
    total_sessions = summary.get('total_sessions', 0)
    total_cards = summary.get('total_cards_reviewed', 0)
    total_learned = summary.get('total_learned', 0)
    total_uncertain = summary.get('total_uncertain', 0)
    total_not_learned = summary.get('total_not_learned', 0)
    total_duration = summary.get('total_duration_seconds', 0)
    avg_duration = summary.get('average_session_duration', 0)

    # Summary table
    summary_data = [
        ['Total Quiz Sessions:', str(total_sessions)],
        ['Total Cards Reviewed:', str(total_cards)],
        ['Cards Learned (Box 1):', f"{total_learned} ({(total_learned/total_cards*100):.1f}%)" if total_cards > 0 else '0'],
        ['Cards Uncertain (Box 2):', f"{total_uncertain} ({(total_uncertain/total_cards*100):.1f}%)" if total_cards > 0 else '0'],
        ['Cards Not Learned (Box 3):', f"{total_not_learned} ({(total_not_learned/total_cards*100):.1f}%)" if total_cards > 0 else '0'],
        ['Total Study Time:', format_duration(total_duration)],
        ['Average Session Duration:', format_duration(int(avg_duration))],
    ]

    summary_table = Table(summary_data, colWidths=[10*cm, 7*cm])
    summary_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#2c3e50')),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LINEBELOW', (0, 0), (-1, -1), 0.5, colors.HexColor('#e0e0e0')),
    ]))

    story.append(summary_table)
    story.append(Spacer(1, 1*cm))

    # Session History
    story.append(Paragraph("<b>Session History</b>", heading_style))

    sessions = report_data.get('sessions', [])

    if not sessions:
        story.append(Paragraph("No quiz sessions found in this period.", styles['Normal']))
    else:
        # Session table headers
        session_table_data = [[
            Paragraph('<b>Date</b>', styles['Normal']),
            Paragraph('<b>Time</b>', styles['Normal']),
            Paragraph('<b>Flashcard Set</b>', styles['Normal']),
            Paragraph('<b>Cards</b>', styles['Normal']),
            Paragraph('<b>Score</b>', styles['Normal']),
            Paragraph('<b>Duration</b>', styles['Normal']),
        ]]

        # Add session rows
        for session in sessions:
            # Parse datetime
            completed_str = session.get('completed_at')
            try:
                if completed_str:
                    completed = datetime.fromisoformat(completed_str.replace('Z', '+00:00'))
                    date_str = completed.strftime('%Y-%m-%d')
                    time_str = completed.strftime('%H:%M')
                else:
                    date_str = 'N/A'
                    time_str = 'N/A'
            except:
                date_str = 'N/A'
                time_str = 'N/A'

            title = session.get('flashcard_title') or 'Unknown'
            cards_reviewed = session.get('cards_reviewed', 0)

            box1 = session.get('box1_count', 0)
            box2 = session.get('box2_count', 0)
            box3 = session.get('box3_count', 0)

            score_pct = calculate_score_percentage(box1, box2, box3)
            score_str = f"{box1}/{cards_reviewed} ({score_pct:.0f}%)"

            duration = session.get('duration_seconds', 0)
            duration_str = format_duration(duration) if duration else 'N/A'

            session_table_data.append([
                date_str,
                time_str,
                Paragraph(title, styles['Normal']),
                str(cards_reviewed),
                score_str,
                duration_str
            ])

        # Create session table
        session_table = Table(
            session_table_data,
            colWidths=[2.5*cm, 2*cm, 6*cm, 2*cm, 3*cm, 2*cm]
        )

        session_table.setStyle(TableStyle([
            # Header row
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#667eea')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('ALIGN', (0, 0), (-1, 0), 'CENTER'),

            # Data rows
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
            ('TEXTCOLOR', (0, 1), (-1, -1), colors.HexColor('#2c3e50')),
            ('ALIGN', (0, 1), (1, -1), 'CENTER'),  # Date and time centered
            ('ALIGN', (3, 1), (-1, -1), 'CENTER'),  # Cards, score, duration centered
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),

            # Grid
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e0e0e0')),

            # Alternating row colors
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8f9fa')]),

            # Padding
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ]))

        story.append(session_table)

    # Footer
    story.append(Spacer(1, 1*cm))
    footer_text = f"Generated by Ommiquiz on {datetime.now().strftime('%Y-%m-%d at %H:%M')}"
    footer_style = ParagraphStyle(
        'Footer',
        parent=styles['Normal'],
        fontSize=8,
        textColor=colors.HexColor('#95a5a6'),
        alignment=TA_CENTER
    )
    story.append(Paragraph(footer_text, footer_style))

    # Build PDF
    doc.build(story)

    # Reset buffer position
    output_buffer.seek(0)

    return output_buffer
