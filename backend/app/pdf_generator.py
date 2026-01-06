"""
PDF Generator for Speed Quiz Cards

Generates a printable PDF worksheet with 12 randomly selected flashcards.
Single choice questions include a dotted line for writing answers.
Multiple choice questions include checkboxes for each option.
"""

import random
from io import BytesIO
from typing import List, Dict, Any
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER


def select_random_cards(cards: List[Dict[str, Any]], count: int = 12) -> List[Dict[str, Any]]:
    """
    Randomly select cards using Fisher-Yates shuffle.

    Args:
        cards: List of flashcard dictionaries
        count: Number of cards to select (default: 12)

    Returns:
        List of randomly selected cards
    """
    if len(cards) <= count:
        return cards.copy()

    shuffled = cards.copy()
    random.shuffle(shuffled)
    return shuffled[:count]


def create_dotted_line(width: float = 15) -> str:
    """
    Create a dotted line for answer writing.

    Args:
        width: Width in centimeters

    Returns:
        String of dots
    """
    return "." * int(width * 10)


def generate_speed_quiz_pdf(
    flashcard_set: Dict[str, Any],
    output_buffer: BytesIO = None
) -> BytesIO:
    """
    Generate a PDF worksheet for speed quiz (12 random cards).

    Args:
        flashcard_set: Dictionary containing flashcard set data with 'cards' list
        output_buffer: Optional BytesIO buffer to write to

    Returns:
        BytesIO buffer containing the generated PDF
    """
    if output_buffer is None:
        output_buffer = BytesIO()

    # Get cards and select 12 random ones
    cards = flashcard_set.get('flashcards', [])
    if not cards:
        cards = flashcard_set.get('cards', [])

    selected_cards = select_random_cards(cards, 12)

    # Create PDF document
    doc = SimpleDocTemplate(
        output_buffer,
        pagesize=A4,
        topMargin=2*cm,
        bottomMargin=2*cm,
        leftMargin=2*cm,
        rightMargin=2*cm
    )

    # Get styles
    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=16,
        textColor=colors.HexColor('#2c3e50'),
        spaceAfter=12,
        alignment=TA_CENTER
    )

    subtitle_style = ParagraphStyle(
        'CustomSubtitle',
        parent=styles['Normal'],
        fontSize=10,
        textColor=colors.HexColor('#7f8c8d'),
        spaceAfter=20,
        alignment=TA_CENTER
    )

    question_style = ParagraphStyle(
        'QuestionStyle',
        parent=styles['Normal'],
        fontSize=11,
        textColor=colors.HexColor('#2c3e50'),
        spaceAfter=8,
        leading=14
    )

    answer_style = ParagraphStyle(
        'AnswerStyle',
        parent=styles['Normal'],
        fontSize=10,
        textColor=colors.HexColor('#34495e'),
        leftIndent=20,
        spaceAfter=4
    )

    # Build PDF content
    story = []

    # Title
    title = flashcard_set.get('title', 'Speed Quiz')
    story.append(Paragraph(f"<b>{title}</b>", title_style))

    # Subtitle
    subtitle_text = "Speed Quiz Worksheet - 12 Random Questions"
    story.append(Paragraph(subtitle_text, subtitle_style))
    story.append(Spacer(1, 0.5*cm))

    # Add questions
    for idx, card in enumerate(selected_cards, 1):
        question = card.get('question', 'No question available')
        card_type = card.get('type', 'single')

        # Determine card type
        if card_type == 'multiple' or 'answers' in card or 'correctAnswers' in card:
            card_type = 'multiple'
        else:
            card_type = 'single'

        # Question number and text
        question_text = f"<b>Question {idx}:</b> {question}"
        story.append(Paragraph(question_text, question_style))

        if card_type == 'single':
            # Single choice: add dotted line for answer
            dotted_line = create_dotted_line(15)
            story.append(Paragraph(f"Answer: {dotted_line}", answer_style))
            story.append(Spacer(1, 0.3*cm))

        else:
            # Multiple choice: add checkboxes
            answers = card.get('answers', [])
            if answers:
                # Create table for checkboxes
                table_data = []
                for answer_idx, answer in enumerate(answers):
                    checkbox = "☐"  # Empty checkbox
                    table_data.append([
                        Paragraph(checkbox, answer_style),
                        Paragraph(answer, answer_style)
                    ])

                # Create table
                table = Table(
                    table_data,
                    colWidths=[1*cm, 14*cm],
                    style=TableStyle([
                        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                        ('LEFTPADDING', (0, 0), (-1, -1), 5),
                        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
                        ('TOPPADDING', (0, 0), (-1, -1), 2),
                        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
                    ])
                )
                story.append(table)
                story.append(Spacer(1, 0.3*cm))

        # Add spacing between questions
        if idx < len(selected_cards):
            story.append(Spacer(1, 0.5*cm))

    # Add footer
    story.append(Spacer(1, 1*cm))
    footer_text = f"Generated by Ommiquiz | {len(selected_cards)} questions"
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
