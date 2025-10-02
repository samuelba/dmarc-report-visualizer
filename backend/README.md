# DMARC Report Backend

This is the backend service for the DMARC Report application. It's built with NestJS and provides APIs for processing and querying DMARC reports.

## Features

- Unzip DMARC reports (zip, gz)
- Parse XML DMARC reports
- Store reports in PostgreSQL database
- Query and analyze report data
- RESTful API for frontend integration
- Optional background worker that watches a directory for new DMARC reports

## Prerequisites

- Node.js (v18 or later)
- npm (v8 or later)
- PostgreSQL (v14 or later)
- Docker and Docker Compose (optional, for containerized setup)

## Installation

```bash
# Install dependencies
npm install
```

## Configuration

Create a `.env` file in the `backend` directory.

Default directories are created under `backend/reports/incoming` and `backend/reports/processed`.

## Running the app

```bash
# Development
npm run start:dev

# Production mode
npm run start:prod
```

## Docker

```bash
# Build and start containers
npm run docker:build
npm run docker:up

# Run in detached mode
npm run docker:dev

# Stop containers
npm run docker:down
```

## Test

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
```
