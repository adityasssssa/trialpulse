.PHONY: setup check data train report

setup:
	python3 -m venv .venv && . .venv/bin/activate && pip install -U pip && pip install -r requirements.txt && pip install -e .

check:
	python scripts/check_api.py

data:
	python -m trialpulse.fetch

train:
	python -m trialpulse.train

report:
	python -m trialpulse.report
