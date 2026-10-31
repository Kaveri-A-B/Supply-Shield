# SupplyShield educational ML data work

This directory contains Olist data acquisition, inspection, exploratory analysis, and the standalone Phase 1B educational model-training workflow. The trained model is not connected to the existing React, Express, or MongoDB application.

## Source and license

- Source: [Olist Brazilian E-Commerce Public Dataset](https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce)
- Publisher: Olist, via Kaggle
- License shown on the dataset card: CC BY-NC-SA 4.0
- Intended use here: non-commercial education and internship learning. Do not use the downloaded or derived dataset for commercial production without a separate rights review.
- Keep the original CSV files unmodified under `ml/data/raw/`. That directory is ignored by Git so the dataset is not committed.

## Environment

Use a supported Python 3 version and install the pinned local dependencies from the repository root:

```powershell
python -m pip install -r ml/requirements.txt
```

If `python` resolves to a Windows Store alias, use your actual Python interpreter path for `-m pip` and for running scripts. The Python interpreter installed on the machine used for this setup was Python 3.15; pandas and matplotlib were available there, and the Kaggle CLI was installed with its required runtime dependencies. A fresh setup should follow the Kaggle CLI's currently supported Python versions.

## Kaggle authentication and download

An authenticated Kaggle CLI is optional: the download script first tries the CLI, then falls back to Kaggle's public dataset download endpoint for this public dataset. To try the CLI interactively, keep its authentication files in the Git-ignored project-local directory. Do not paste tokens or `kaggle.json` contents into chat:

```powershell
$env:KAGGLE_CONFIG_DIR = (Join-Path (Get-Location) 'ml\.kaggle')
$kaggle = 'C:\path\to\your\Python\Scripts\kaggle.exe'
& $kaggle auth login
```

Replace the example with the `Scripts\kaggle.exe` path beside your Python interpreter. Keep that PowerShell window open so the environment setting remains active. Then from the repository root run:

```powershell
python ml/scripts/download_dataset.py
```

The script tries the Kaggle CLI and falls back to Kaggle's public dataset endpoint if CLI authentication is unavailable. It retains the downloaded archive under `ml/data/downloads/`, and extracts CSV files into `ml/data/raw/`. It refuses to overwrite an existing raw file and validates archive paths before extraction.

## Inspection and EDA

```powershell
python ml/scripts/inspect_dataset.py
python ml/scripts/analyze_olist.py
```

Outputs go under `ml/reports/`. The inspection script reports file-level shape, inferred pandas types, missing values, duplicate rows, duplicate keys, and foreign-key orphan counts. The analysis script creates a late-delivery label only for delivered orders with valid actual and estimated timestamps; it reports the exclusions, eligible class counts/rates, and EDA charts. Neither script trains a model.

## Phase 1B training and evaluation

After installing `ml/requirements.txt` and obtaining the raw CSVs, run:

```powershell
python ml/scripts/train_olist.py
```

The training workflow makes one row per eligible order, uses a chronological 70/15/15 train/validation/test split, fits preprocessing only on training data, and compares a majority baseline, class-weighted Logistic Regression, a shallow Decision Tree, and class-weighted Random Forest. It chooses thresholds on validation data, then reports test results. Output is in `docs/ML_TRAINING_REPORT.md` and `ml/reports/model_evaluation.json`; the selected fitted pipeline is stored locally under Git-ignored `ml/artifacts/`.

After training, rerun `python ml/scripts/analyze_model_errors.py` to produce the read-only test error review in `docs/ML_ERROR_ANALYSIS.md` and subgroup details in `ml/reports/model_error_analysis.json`. It reuses the saved model and held-out test period; it does not retrain or retune the threshold.

Run `python ml/scripts/review_olist_features.py` for the exploratory point-in-time and feature-set sensitivity review. It compares variants on training and validation only and does not compute new test metrics or overwrite the saved model.

This is only a non-commercial educational Olist benchmark. The raw scores are not calibrated, Olist is not the same as SupplyShield's shipment data, and the trained artifact is not exposed to the application. Do not use its score as an operational prediction.

The benchmark assumes prediction at order purchase/placement. Actual delivery timestamps and terminal status are used only for label construction/eligibility. Reviews, payment details, raw identifiers, and post-purchase carrier timestamps are excluded from model inputs. `promised_lead_days` uses the estimated delivery date under the assumption that the promise is known at purchase; the training report documents this limitation. Review feature eligibility before any future retraining or live integration.
