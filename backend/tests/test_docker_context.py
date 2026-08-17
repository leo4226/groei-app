"""The Fly build context stays small, and the release command keeps working.

A 1.5 GB upload to the remote builder came from `.dockerignore` patterns being
anchored at the context root: `frontend/` and `node_modules/` never reached
inside `.worktrees/<branch>/`, and each worktree is a complete second checkout.
Nothing from there reaches the image — the Dockerfile only COPYs `backend/` and
the icons — so the symptom was slow deploys rather than a broken release, which
is exactly the kind of thing nobody notices until the bill or the clock says so.
"""
import re
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOCKERIGNORE = (ROOT / ".dockerignore").read_text()


def _patterns():
    return [
        line.strip() for line in DOCKERIGNORE.splitlines()
        if line.strip() and not line.strip().startswith("#")
    ]


def test_worktrees_are_excluded_from_the_build_context():
    assert ".worktrees/" in _patterns()


def test_heavy_directories_are_excluded_at_every_depth():
    # The root-anchored form alone is what let worktrees in. Anything that can
    # appear nested needs the `**/` form as well.
    for pattern in ("**/node_modules/", "**/.venv/", "**/.worktrees/"):
        assert pattern in _patterns(), f"{pattern} missing — nested copies will ship"


def test_only_the_root_dockerignore_exists():
    # Docker reads the context-root file and nothing else. A nested one looks
    # like it is protecting something while doing nothing at all; backend/ had
    # one excluding tests/ and *.db, and both were shipping in the image.
    nested = [
        p for p in ROOT.rglob(".dockerignore")
        if p != ROOT / ".dockerignore" and ".worktrees" not in p.parts
    ]
    assert not nested, f"nested .dockerignore files are inert: {nested}"


def test_the_release_command_still_has_every_script_it_calls():
    # These run on a temporary machine at deploy time, against the image — so
    # excluding the wrong path here surfaces as a failed release, not a red test.
    fly = tomllib.loads((ROOT / "fly.toml").read_text())
    command = fly["deploy"]["release_command"]
    modules = re.findall(r"python -m scripts\.(\w+)", command)
    assert modules, "no scripts parsed from release_command — did its shape change?"
    for module in modules:
        script = ROOT / "backend" / "scripts" / f"{module}.py"
        assert script.exists(), f"release_command runs {module}, which does not exist"
        assert "backend/scripts" not in DOCKERIGNORE
