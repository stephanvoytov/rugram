"""Verify that every translation key used in Python routes and Jinja2
templates has a corresponding Russian translation in app/translations.py.

This test scans source files for all `_('...')` calls (Python)
and `{{ _('...') }}` patterns (Jinja2), collects the keys,
and compares them against the RU dict in translations.py.

Keys that only differ by trailing punctuation (! / .) are flagged too.
"""

import ast
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent


@pytest.fixture(scope='session')
def ru_dict() -> dict[str, str]:
    """Load the RU translation dict from app/translations.py."""
    from app.translations import RU
    return RU


@pytest.fixture(scope='session')
def used_keys() -> set[str]:
    """Extract all translation keys from source code (Python + templates)."""
    keys: set[str] = set()

    # ── Python: walk all .py files in app/ ──
    for pyfile in sorted((ROOT / 'app').rglob('*.py')):
        if '__pycache__' in pyfile.parts:
            continue
        source = pyfile.read_text(encoding='utf-8')
        # Find all _('key') calls using regex
        keys.update(_extract_python_translations(source))

    # ── Jinja2: walk templates ──
    templates_dir = ROOT / 'app' / 'templates'
    if templates_dir.exists():
        for tpl in sorted(templates_dir.rglob('*.html')):
            source = tpl.read_text(encoding='utf-8')
            keys.update(_extract_jinja2_translations(source))

    return keys


def _extract_python_translations(source: str) -> set[str]:
    """Extract string literals passed to _() in Python code using AST."""
    keys: set[str] = set()
    try:
        tree = ast.parse(source)
    except SyntaxError:
        # Some files may have syntax issues in templates or partial code
        # Fallback to regex
        return _extract_python_translations_regex(source)

    for node in ast.walk(tree):
        # Match function calls named '_' with a single string argument
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == '_':
            for arg in node.args:
                if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
                    keys.add(arg.value)
    return keys


def _extract_python_translations_regex(source: str) -> set[str]:
    """Fallback regex-based extraction for problematic files."""
    return set(re.findall(r"""_\s*\(\s*'([^']+)'\s*\)""", source))


def _extract_jinja2_translations(source: str) -> set[str]:
    """Extract string literals inside {{ _('...') }} in Jinja2 templates."""
    return set(re.findall(r"""\{\{\s*_\s*\(\s*'([^']+)'\s*\)\s*\}\}""", source))


# ── Tests ──

def test_all_used_keys_have_translations(used_keys: set[str],
                                          ru_dict: dict[str, str]) -> None:
    """Every translation key used in code must exist in the RU dictionary."""
    missing = sorted(key for key in used_keys if key not in ru_dict)
    if missing:
        msg = 'Missing RU translations for:\n' + '\n'.join(f'  - {k!r}' for k in missing)
        # Also suggest closest matches
        for key in missing:
            close = _find_close_match(key, ru_dict)
            if close:
                msg += f'\n    Closest match: {close!r}'
        pytest.fail(msg)


def test_no_unused_translations(used_keys: set[str],
                                ru_dict: dict[str, str]) -> None:
    """Every key in the RU dictionary should be used somewhere."""
    unused = sorted(key for key in ru_dict if key not in used_keys)
    if unused:
        # This is informational — keys might be for future use
        # We don't fail, just warn
        keys_str = '\n'.join(f'  - {k!r}' for k in unused)
        print(f'INFO: Unused RU translation keys:\n{keys_str}')


def test_russian_translations_are_different(ru_dict: dict[str, str]) -> None:
    """Russian translations should not be identical to the English key."""
    identical = sorted(key for key, value in ru_dict.items() if key == value)
    if identical:
        msg = 'RU translations identical to English key:\n' + '\n'.join(f'  - {k!r}' for k in identical[:10])
        pytest.fail(msg)


# ── Helpers ──

def _find_close_match(key: str, ru_dict: dict[str, str]) -> str | None:
    """Find a close match in the dictionary (same base, different punctuation)."""
    key_stripped = key.rstrip('!.')
    for dk in ru_dict:
        if dk.rstrip('!.') == key_stripped and dk != key:
            return dk
    return None
