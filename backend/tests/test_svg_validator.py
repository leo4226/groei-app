import pytest
from services.svg_validator import validate_icon_svg, SvgValidationError

GOOD = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" '
    'height="100"><ellipse cx="50" cy="50" rx="10" ry="10" fill="#4A7C4E"/></svg>'
)


def test_valid_svg_passes_and_is_returned_normalised():
    out = validate_icon_svg(GOOD)
    assert out.strip().startswith("<svg")
    assert 'viewBox="0 0 100 100"' in out


@pytest.mark.parametrize("bad", [
    "not xml at all",
    '<div>nope</div>',
    '<svg viewBox="0 0 50 50" width="50" height="50"></svg>',          # wrong viewBox
    '<svg viewBox="0 0 100 100"><script>alert(1)</script></svg>',       # script
    '<svg viewBox="0 0 100 100"><image href="http://x/y.png"/></svg>',  # external ref
    '<svg viewBox="0 0 100 100"><rect onload="x()"/></svg>',            # event handler
    '<svg viewBox="0 0 100 100"><foreignObject/></svg>',               # disallowed tag
])
def test_invalid_svg_rejected(bad):
    with pytest.raises(SvgValidationError):
        validate_icon_svg(bad)
