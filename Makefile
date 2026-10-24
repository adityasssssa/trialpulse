.PHONY: setup check data train app

# Use the project venv if it exists, so targets work without `source .venv/bin/activate`
PY := $(if $(wildcard .venv/bin/python),.venv/bin/python,python3)

setup:
	python3 -m venv .venv && . .venv/bin/activate && pip install -U pip && pip install -r requirements.txt && pip install -e .

check:
	$(PY) scripts/check_api.py

data:
	$(PY) -m trialpulse.fetch

train:
	$(PY) -m trialpulse.train

app:
	$(PY) -m streamlit run app/app.py
