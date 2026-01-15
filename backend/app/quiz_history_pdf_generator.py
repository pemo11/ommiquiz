"""
Quiz History PDF Generator

Generates PDF reports for user quiz history with summary statistics and session details.
"""

from io import BytesIO
from datetime import datetime
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT


def generate_quiz_history_pdf(report_data: dict, user_email: str) -> BytesIO:
    """
    Generate a PDF report for quiz history.

    Args:
        report_data: Dictionary containing summary and sessions data
        user_email: Email of the user for the report

    Returns:
        BytesIO object containing the PDF data
    """
    buffer = BytesIO()

    # Create document
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=72,
        leftMargin=72,
        topMargin=72,
        bottomMargin=18,
    )

    # Container for the 'Flowable' objects
    elements = []

    # Get styles
    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=colors.HexColor('#667eea'),
        spaceAfter=30,
        alignment=TA_CENTER
    )

    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontSize=16,
        textColor=colors.HexColor('#667eea'),
        spaceAfter=12,
        spaceBefore=12
    )

    # Title
    title = Paragraph("Quiz History Report", title_style)
    elements.append(title)

    # User info and date
    info_style = styles['Normal']
    info_style.alignment = TA_CENTER
    user_info = Paragraph(f"<b>User:</b> {user_email}", info_style)
    elements.append(user_info)

    date_info = Paragraph(
        f"<b>Generated:</b> {datetime.now().strftime('%B %d, %Y at %H:%M')}",
        info_style
    )
    elements.append(date_info)

    period_info = Paragraph(
        f"<b>Period:</b> Last {report_data.get('days', 30)} days",
        info_style
    )
    elements.append(period_info)

    elements.append(Spacer(1, 0.3 * inch))

    # Summary Section
    summary_heading = Paragraph("Summary Statistics", heading_style)
    elements.append(summary_heading)

    summary = report_data.get('summary', {})

    summary_data = [
        ['Metric', 'Value'],
        ['Total Sessions', str(summary.get('total_sessions', 0))],
        ['Total Cards Reviewed', str(summary.get('total_cards_reviewed', 0))],
        ['Box 1 (Needs Review)', str(summary.get('total_box1', 0))],
        ['Box 2 (Learning)', str(summary.get('total_box2', 0))],
        ['Box 3 (Mastered)', str(summary.get('total_box3', 0))],
        ['Total Time (minutes)', f"{summary.get('total_duration', 0) / 60:.1f}"],
    ]

    if summary.get('average_time_to_flip_seconds'):
        summary_data.append([
            'Avg. Time to Flip (seconds)',
            f"{summary.get('average_time_to_flip_seconds'):.1f}"
        ])

    summary_table = Table(summary_data, colWidths=[3.5 * inch, 2 * inch])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#667eea')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 12),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
        ('GRID', (0, 0), (-1, -1), 1, colors.grey),
        ('FONTNAME', (0, 1), (0, -1), 'Helvetica-Bold'),
    ]))

    elements.append(summary_table)
    elements.append(Spacer(1, 0.3 * inch))

    # Session History Section
    sessions = report_data.get('sessions', [])

    if sessions:
        session_heading = Paragraph("Session History", heading_style)
        elements.append(session_heading)

        # Session table headers
        session_data = [[
            'Date',
            'Flashcard Set',
            'Cards',
            'Box 1',
            'Box 2',
            'Box 3',
            'Duration\n(min)'
        ]]

        # Add session rows
        for session in sessions:
            completed_at = datetime.fromisoformat(session['completed_at'].replace('Z', '+00:00'))
            date_str = completed_at.strftime('%m/%d/%Y\n%H:%M')

            title = session.get('flashcard_title', session.get('flashcard_id', 'Unknown'))
            # Truncate long titles
            if len(title) > 25:
                title = title[:22] + '...'

            duration = session.get('duration_seconds', 0)
            duration_min = f"{duration / 60:.1f}" if duration else "—"

            session_data.append([
                date_str,
                title,
                str(session.get('cards_reviewed', 0)),
                str(session.get('box1_count', 0)),
                str(session.get('box2_count', 0)),
                str(session.get('box3_count', 0)),
                duration_min
            ])

        # Create session table
        col_widths = [1.0 * inch, 2.0 * inch, 0.6 * inch, 0.6 * inch, 0.6 * inch, 0.6 * inch, 0.7 * inch]
        session_table = Table(session_data, colWidths=col_widths, repeatRows=1)

        session_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#667eea')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('ALIGN', (1, 1), (1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 9),
            ('FONTSIZE', (0, 1), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('TOPPADDING', (0, 1), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 1), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.lightgrey]),
        ]))

        elements.append(session_table)
    else:
        no_sessions = Paragraph(
            "<i>No quiz sessions found for the selected period.</i>",
            styles['Normal']
        )
        elements.append(no_sessions)

    elements.append(Spacer(1, 0.5 * inch))

    # Footer
    footer_style = ParagraphStyle(
        'Footer',
        parent=styles['Normal'],
        fontSize=8,
        textColor=colors.grey,
        alignment=TA_CENTER
    )
    footer = Paragraph(
        "Generated by Ommiquiz - Your Learning Companion",
        footer_style
    )
    elements.append(footer)

    # Build PDF
    doc.build(elements)

    # Get the value of the BytesIO buffer
    buffer.seek(0)
    return buffer
