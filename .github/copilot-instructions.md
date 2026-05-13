# K6 Analyzer - Copilot Instructions

## Project Overview

K6 Analyzer is a Node.js web application for visualizing and analyzing k6 load test results. The application provides:

- File upload interface for k6 test JSON results
- Dashboard displaying core metrics (response times, requests, checks, data transfer)
- Raw results viewer for detailed inspection
- RESTful API for programmatic access

## Architecture

**Backend:**
- Express.js server running on port 3000
- Multer for file uploads (stored in `/uploads` directory)
- JSON parsing and metrics extraction
- CORS enabled for cross-origin requests

**Frontend:**
- Single-page application (SPA) with vanilla JavaScript
- Drag-and-drop file upload
- Real-time metrics visualization
- Responsive design with CSS Grid

**Key Files:**
- `index.js` - Express server and API routes
- `public/index.html` - Main UI
- `public/style.css` - Styling
- `public/app.js` - Frontend logic

## Running the Application

```bash
npm start
```

Access at `http://localhost:3000`

## Key Metrics Extracted

- **HTTP Requests**: Total number of HTTP requests made
- **Response Time**: Min, max, and average duration in milliseconds
- **Data Transfer**: Bytes sent and received
- **Checks**: Number of passed and failed checks
- **Iteration Duration**: Time per test iteration

## Common Development Tasks

### Adding New Metrics
Edit the `extractMetrics()` function in `index.js` to parse additional k6 metrics from the results JSON.

### Styling Changes
Update `public/style.css`. CSS Grid is used for responsive layouts.

### Frontend Logic
Modify `public/app.js` for upload handling, API calls, and UI updates.

### API Endpoints
- `POST /api/upload` - Upload k6 results file
- `GET /api/results` - Retrieve loaded results
- `GET /api/metrics` - Get metrics summary

## Dependencies

- express (v4.18.2) - Web framework
- cors (v2.8.5) - CORS middleware
- multer (v1.4.5-lts.1) - File upload handling

To update dependencies:
```bash
npm install
npm audit fix
```

## Troubleshooting

- **Port 3000 in use**: Change PORT environment variable
- **File upload fails**: Ensure JSON format is valid and file size is reasonable
- **Metrics show as "-"**: Check k6 results JSON structure matches expected format

## Future Enhancements

- Multiple file comparison
- PDF/CSV export
- Advanced filtering and charts
- Performance trends
- Saved reports and history
