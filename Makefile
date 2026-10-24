.PHONY: setup check data train report slides handcheck

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

handcheck:
	python -m trialpulse.handcheck

slides:
	python -m trialpulse.slides
