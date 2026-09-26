# Makefile for gemini-cli

.PHONY: help install build bundle typecheck test lint format preflight clean start debug run create-alias

help:
	@echo "Makefile for langvis-cli (gemini-cli fork)"
	@echo ""
	@echo "Usage:"
	@echo "  make install          - Install npm dependencies"
	@echo "  make build            - Build workspace packages (tsc)"
	@echo "  make bundle           - Produce the runnable bundle/gemini.js"
	@echo "  make typecheck        - Typecheck all workspaces"
	@echo "  make test             - Run the test suite"
	@echo "  make lint             - Lint the code"
	@echo "  make format           - Format the code"
	@echo "  make preflight        - Clean, format, build, lint, typecheck"
	@echo "  make clean            - Remove generated files"
	@echo "  make start            - Start in dev mode (scripts/start.js)"
	@echo "  make debug            - Start in debug mode"
	@echo "  make run              - Run the bundled CLI (LANGVIS_SERVER_URL=...)"
	@echo ""
	@echo "  make create-alias     - Create a 'gemini' alias for your shell"

install:
	npm install

build:
	npm run build

bundle:
	npm run bundle

typecheck:
	npm run typecheck

test:
	npm run test

lint:
	npm run lint

format:
	npm run format

preflight:
	npm run preflight

clean:
	npm run clean

start:
	npm run start

debug:
	npm run debug

run:
	node bundle/gemini.js

create-alias:
	scripts/create_alias.sh
