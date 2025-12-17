#!/usr/bin/env python3
"""
Flashcard YAML Schema Validation Script

This script validates all YAML files in the flashcards directory against 
the ommiquiz.schema.yaml schema file.
"""

import yaml
import json
from pathlib import Path
from jsonschema import validate, ValidationError, Draft7Validator
from typing import Dict, List, Any
import sys

def load_schema(schema_path: Path) -> Dict[Any, Any]:
    """Load the YAML schema file"""
    try:
        with open(schema_path, 'r', encoding='utf-8') as f:
            schema = yaml.safe_load(f)
        return schema
    except Exception as e:
        print(f"❌ Failed to load schema from {schema_path}: {str(e)}")
        sys.exit(1)

def validate_flashcard_file(file_path: Path, schema: Dict[Any, Any]) -> Dict[str, Any]:
    """Validate a single flashcard file against the schema"""
    print(f"🔍 Validating {file_path.name}...")
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = yaml.safe_load(f)
    except yaml.YAMLError as e:
        return {
            "filename": file_path.name,
            "valid": False,
            "errors": [f"YAML parsing error: {str(e)}"],
            "warnings": []
        }
    except Exception as e:
        return {
            "filename": file_path.name,
            "valid": False,
            "errors": [f"File reading error: {str(e)}"],
            "warnings": []
        }

    # Validate against schema
    validator = Draft7Validator(schema)
    errors = []
    warnings = []
    
    for error in validator.iter_errors(data):
        field_path = " -> ".join(str(p) for p in error.absolute_path) if error.absolute_path else "root"
        error_msg = f"Field '{field_path}': {error.message}"
        errors.append(error_msg)
    
    # Additional custom validations
    if data and isinstance(data, dict):
        # Check if flashcards array is not empty
        flashcards = data.get("flashcards", [])
        if not flashcards:
            warnings.append("No flashcards found in the file")
        
        # Check for duplicate questions
        questions = [card.get("question", "") for card in flashcards if isinstance(card, dict)]
        duplicate_questions = set([q for q in questions if questions.count(q) > 1 and q])
        if duplicate_questions:
            warnings.extend([f"Duplicate question found: '{q}'" for q in duplicate_questions])
            
        # Check for empty questions or answers
        for i, card in enumerate(flashcards):
            if isinstance(card, dict):
                question = card.get("question", "")
                answer = card.get("answer", "")
                
                # Convert to string if not already a string to handle the strip() method
                question_str = str(question) if question is not None else ""
                answer_str = str(answer) if answer is not None else ""
                
                if not question_str.strip():
                    warnings.append(f"Card {i+1}: Empty or missing question")
                if not answer_str.strip():
                    warnings.append(f"Card {i+1}: Empty or missing answer")
                
                # Check for non-string types in question/answer fields
                if not isinstance(question, str) and question is not None:
                    warnings.append(f"Card {i+1}: Question should be a string, found {type(question).__name__}")
                if not isinstance(answer, str) and answer is not None:
                    warnings.append(f"Card {i+1}: Answer should be a string, found {type(answer).__name__}")
    
    return {
        "filename": file_path.name,
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "stats": {
            "total_cards": len(data.get("flashcards", [])) if data else 0,
            "has_metadata": bool(data and data.get("author") and data.get("description")) if data else False
        }
    }

def validate_all_flashcards(flashcards_dir: Path, schema_path: Path) -> Dict[str, Any]:
    """Validate all YAML files in the flashcards directory"""
    
    print(f"📋 Loading schema from {schema_path.name}...")
    schema = load_schema(schema_path)
    
    # Find all YAML files
    yaml_files = []
    for pattern in ["*.yaml", "*.yml"]:
        yaml_files.extend(flashcards_dir.glob(pattern))
    
    # Exclude specific files
    excluded_files = {"ommiquiz.schema.yaml", "flashcards_catalog.yaml"}
    yaml_files = [f for f in yaml_files if f.name not in excluded_files]
    
    if not yaml_files:
        return {
            "success": True,
            "message": "No flashcard YAML files found",
            "results": []
        }
    
    print(f"📁 Found {len(yaml_files)} flashcard files to validate")
    print("-" * 60)
    
    # Validate each file
    results = []
    for yaml_file in sorted(yaml_files):
        result = validate_flashcard_file(yaml_file, schema)
        results.append(result)
    
    # Summary statistics
    total_files = len(results)
    valid_files = len([r for r in results if r["valid"]])
    invalid_files = total_files - valid_files
    total_cards = sum(r["stats"]["total_cards"] for r in results)
    
    return {
        "success": True,
        "summary": {
            "total_files": total_files,
            "valid_files": valid_files,
            "invalid_files": invalid_files,
            "total_flashcards": total_cards
        },
        "results": results
    }

def main():
    """Main function to run the validation"""
    print("🔍 OmniQuiz Flashcard Schema Validation")
    print("=" * 60)
    
    # Set up paths
    current_dir = Path(__file__).parent
    flashcards_dir = current_dir / "flashcards"
    schema_path = flashcards_dir / "ommiquiz.schema.yaml"
    
    print(f"📁 Flashcards directory: {flashcards_dir}")
    print(f"📋 Schema file: {schema_path}")
    
    if not flashcards_dir.exists():
        print(f"❌ Flashcards directory not found: {flashcards_dir}")
        sys.exit(1)
    
    if not schema_path.exists():
        print(f"❌ Schema file not found: {schema_path}")
        sys.exit(1)
    
    print("-" * 60)
    
    # Run validation
    validation_result = validate_all_flashcards(flashcards_dir, schema_path)
    
    if not validation_result["success"]:
        print(f"❌ Validation failed: {validation_result['error']}")
        sys.exit(1)
    
    print("-" * 60)
    
    # Print detailed results
    for result in validation_result["results"]:
        status = "✅" if result["valid"] else "❌"
        print(f"\n{status} {result['filename']}")
        print(f"   📊 Cards: {result['stats']['total_cards']}")
        print(f"   📝 Has metadata: {'Yes' if result['stats']['has_metadata'] else 'No'}")
        
        if result["errors"]:
            print("   🚨 Schema Errors:")
            for error in result["errors"]:
                print(f"      • {error}")
        
        if result["warnings"]:
            print("   ⚠️  Warnings:")
            for warning in result["warnings"]:
                print(f"      • {warning}")
    
    # Print summary
    summary = validation_result["summary"]
    print("\n" + "=" * 60)
    print(f"📊 VALIDATION SUMMARY")
    print(f"   📁 Total files processed: {summary['total_files']}")
    print(f"   ✅ Valid files: {summary['valid_files']}")
    print(f"   ❌ Invalid files: {summary['invalid_files']}")
    print(f"   🃏 Total flashcards: {summary['total_flashcards']}")
    print("=" * 60)
    
    # Final result
    if summary['invalid_files'] > 0:
        print(f"\n❌ Validation completed with {summary['invalid_files']} invalid file(s)")
        print("Please fix the errors above before proceeding.")
        sys.exit(1)
    else:
        print(f"\n✅ SUCCESS: All {summary['valid_files']} flashcard files are valid!")
        print("All files conform to the schema specification.")

if __name__ == "__main__":
    main()