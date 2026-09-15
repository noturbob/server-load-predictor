.PHONY: setup seed train snapshot api web dev test lint up down

setup:
	cd backend && uv sync
	cd frontend && pnpm install

seed:
	cd backend && uv run python -m app.data.seed --source synthetic

train:
	cd backend && uv run python -m app.ml.train

snapshot:
	cd backend && uv run python -m app.data.export_snapshot

api:
	cd backend && uv run uvicorn app.main:app --reload --port 8000

web:
	cd frontend && pnpm dev

dev:
	$(MAKE) -j2 api web

test:
	cd backend && uv run pytest -q
	cd frontend && pnpm lint && pnpm exec tsc --noEmit

lint:
	cd backend && uv run ruff check app tests

up:
	docker compose up --build

down:
	docker compose down
