"""Download and safely extract the original Olist Kaggle CSV archive."""

from __future__ import annotations

import subprocess
import sys
import shutil
import zipfile
from pathlib import Path, PurePosixPath
from urllib.request import Request, urlopen


REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "ml" / "data"
DOWNLOAD_DIR = DATA_DIR / "downloads"
RAW_DIR = DATA_DIR / "raw"
KAGGLE_CONFIG_DIR = REPO_ROOT / "ml" / ".kaggle"
DATASET = "olistbr/brazilian-ecommerce"
PUBLIC_DOWNLOAD_URL = "https://www.kaggle.com/api/v1/datasets/download/olistbr/brazilian-ecommerce"
PUBLIC_ARCHIVE = DOWNLOAD_DIR / "olist-brazilian-ecommerce.zip"


def safe_extract(archive: Path, destination: Path) -> list[Path]:
    destination_resolved = destination.resolve()
    extracted: list[Path] = []
    with zipfile.ZipFile(archive) as zipped:
        members = [item for item in zipped.infolist() if not item.is_dir()]
        for member in members:
            normalized = PurePosixPath(member.filename)
            if normalized.is_absolute() or ".." in normalized.parts:
                raise ValueError(f"Unsafe archive member path: {member.filename}")
            target = (destination / Path(*normalized.parts)).resolve()
            if destination_resolved not in target.parents:
                raise ValueError(f"Archive member escapes destination: {member.filename}")
            if target.exists():
                raise FileExistsError(
                    f"Refusing to overwrite existing raw file: {target.relative_to(destination_resolved)}"
                )

        for member in members:
            normalized = PurePosixPath(member.filename)
            target = destination / Path(*normalized.parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            with zipped.open(member) as source, target.open("xb") as sink:
                while chunk := source.read(1024 * 1024):
                    sink.write(chunk)
            extracted.append(target)
    return extracted


def download_public_archive(destination: Path) -> Path:
    """Download the public dataset from Kaggle's dataset endpoint without credentials."""
    temporary = destination.with_suffix(destination.suffix + ".part")
    request = Request(PUBLIC_DOWNLOAD_URL, headers={"User-Agent": "SupplyShield-educational-ml/1.0"})
    try:
        with urlopen(request, timeout=60) as response, temporary.open("wb") as sink:
            shutil.copyfileobj(response, sink)
        with zipfile.ZipFile(temporary) as archive:
            bad_member = archive.testzip()
            if bad_member is not None:
                raise zipfile.BadZipFile(f"Archive member failed CRC validation: {bad_member}")
        temporary.replace(destination)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise
    return destination


def main() -> int:
    DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    KAGGLE_CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    kaggle_executable = shutil.which("kaggle")
    if kaggle_executable is None:
        scripts_dir = Path(sys.executable).resolve().parent / "Scripts"
        candidates = [scripts_dir / "kaggle.exe", scripts_dir / "kaggle"]
        kaggle_executable = next((str(path) for path in candidates if path.is_file()), None)
    if kaggle_executable is None:
        print("Kaggle CLI is not installed for this Python environment. Install ml/requirements.txt first.", file=sys.stderr)
        return 2

    command = [
        kaggle_executable,
        "datasets",
        "download",
        "-d",
        DATASET,
        "-p",
        str(DOWNLOAD_DIR),
    ]
    try:
        environment = dict(__import__("os").environ)
        environment["KAGGLE_CONFIG_DIR"] = str(KAGGLE_CONFIG_DIR)
        result = subprocess.run(command, capture_output=True, text=True, check=False, env=environment)
    except FileNotFoundError:
        print("Kaggle CLI is not installed. Install ml/requirements.txt first.", file=sys.stderr)
        return 2

    if result.returncode != 0:
        # Kaggle's public dataset endpoint can serve this dataset without an API login.
        # Keep CLI error text private in case it contains local configuration details.
        try:
            if not PUBLIC_ARCHIVE.is_file():
                download_public_archive(PUBLIC_ARCHIVE)
        except Exception as error:
            print(
                "Kaggle CLI and public download fallback both failed. Check network access and, if needed, complete Kaggle CLI authentication. "
                f"Fallback error type: {type(error).__name__}.",
                file=sys.stderr,
            )
            return 1

    archives = sorted(DOWNLOAD_DIR.glob("*.zip"), key=lambda item: item.stat().st_mtime, reverse=True)
    if not archives:
        print("Kaggle CLI returned success but no ZIP archive was found in ml/data/downloads/.", file=sys.stderr)
        return 3

    archive = archives[0]
    try:
        extracted = safe_extract(archive, RAW_DIR)
    except (OSError, zipfile.BadZipFile, ValueError) as error:
        print(f"Archive extraction stopped safely: {error}", file=sys.stderr)
        return 4

    csv_files = [path for path in extracted if path.suffix.lower() == ".csv"]
    print(f"Downloaded archive: {archive.relative_to(REPO_ROOT)}")
    print(f"Extracted {len(csv_files)} CSV files to {RAW_DIR.relative_to(REPO_ROOT)}")
    for path in csv_files:
        print(f"- {path.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
