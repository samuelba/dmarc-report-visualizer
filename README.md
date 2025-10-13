# DMARC Report Visualizer

A web application to visualize DMARC reports, built with NestJS (backend) and Angular (frontend).

| Dashboard | Dashboard Map |
| --- | --- |
| ![Dashboard Screenshot](docs/screenshots/dashboard.png) | ![Dashboard Map Screenshot](docs/screenshots/dashboard_map.png) |

| Explore Reports | Report Raw XML |
| --- | --- |
| ![Explore Reports Screenshot](docs/screenshots/explore.png) | ![Report Raw XML Screenshot](docs/screenshots/explore_xml.png) |

## Quick Start

1) Copy the `.env.example` file to `.env` and adjust as needed

2) Build the docker images

    ```bash
    docker compose build
    ```

3) Start the services

    ```bash
    docker compose up -d
    ```

    - Backend runs at `http://localhost:3000` or what is set in `.env`
    - Frontend runs at `http://localhost:80` or what is set in `.env`
    - Postgres runs at `localhost:5432` or what is set in `.env`

## Features

- Visualize DMARC reports with interactive charts and maps
- Explore individual reports and view raw XML data
- Filter reports
- Upload reports via web interface
- Directory watcher to auto-import reports from a specified folder
- Gmail integration to download reports from email attachments
