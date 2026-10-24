.PHONY: setup check data train report slides export all handcheck

# The project venv created by `make setup`; no need to activate it first.
PY := .venv/bin/python

setup:
	python3 -m venv .venv && . .venv/bin/activate && pip install -U pip && pip install -r requirements.txt && pip install -e .

check:
	$(PY) scripts/check_api.py

data:
	$(PY) -m trialpulse.fetch

train:
	$(PY) -m trialpulse.train

report:
	$(PY) -m trialpulse.report

handcheck:
	$(PY) -m trialpulse.handcheck

slides:
	$(PY) -m trialpulse.slides

export:
	$(PY) -m trialpulse.export

# full rebuild from a fresh API pull; ends with the website exports
all: data train report slides export
