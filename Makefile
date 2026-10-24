.PHONY: setup check data train app

setup:
	python3 -m venv .venv && . .venv/bin/activate && pip install -U pip && pip install -r requirements.txt && pip install -e .

check:
	python scripts/check_api.py

data:
	python -m trialpulse.fetch

train:
	python -m trialpulse.train

app:
	streamlit run app/app.py
