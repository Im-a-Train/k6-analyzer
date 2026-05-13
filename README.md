# K6 Analyzer - Test Results Visualizer

A web application for visualizing and analyzing k6 load test results. Upload your k6 test JSON results and view key metrics and performance data in an interactive dashboard.

## Features

- 📤 **Easy File Upload** - Drag and drop or browse k6 test result JSON files
- 📊 **Core Metrics Dashboard** - View important test metrics at a glance:
  - Total HTTP requests
  - Response time (min, max, average)
  - Data sent and received
  - Check pass/fail statistics
  - Iteration duration
- 📋 **Raw Results Viewer** - Inspect the complete JSON results
- 🎨 **Beautiful UI** - Clean, responsive interface with real-time updates
- 🚀 **Performance Optimized** - Fast loading and smooth interactions

## Prerequisites

- Node.js (v14 or higher)
- npm (comes with Node.js)

## Installation

1. Clone or navigate to the project directory:

```bash
cd k6-analyzer
```

2. Install dependencies:

```bash
npm install
```

## Usage

1. Start the application:

```bash
npm start
```

2. Open your browser and navigate to:

```
http://localhost:3000
```

3. Upload your k6 test results JSON file by:
   - Dragging and dropping the file onto the upload area, or
   - Clicking "Browse Files" to select from your computer

4. View your test metrics and results in the dashboard

## Getting K6 Test Results

To generate a k6 results JSON file, run your k6 test with JSON output:

```bash
# Output results to JSON file
k6 run script.js -o json=results.json

# Or pipe to a file
k6 run script.js --out json > results.json
```

## Project Structure

```
k6-analyzer/
├── index.js              # Express server and API routes
├── package.json          # Node.js dependencies and scripts
├── public/
│   ├── index.html        # Main HTML file
│   ├── style.css         # Styling
│   ├── app.js            # Frontend JavaScript logic
├── uploads/              # Temporary upload directory (created on first upload)
└── README.md             # This file
```

## API Endpoints

### POST /api/upload

Upload a k6 results JSON file

**Request:**

- Form data with file: `multipart/form-data`

**Response:**

```json
{
  "success": true,
  "message": "Results uploaded successfully",
  "summary": {
    "timestamp": "2024-01-15T10:30:00Z",
    "hasMetrics": true,
    "hasGroups": false,
    "metricsCount": 15
  }
}
```

### GET /api/results

Get the currently loaded test results

**Response:**

- Full k6 test results JSON object

### GET /api/metrics

Get extracted metrics summary

**Response:**

```json
{
  "samples": 0,
  "passes": 0,
  "failures": 0,
  "iterationDuration": { "min": 0, "max": 0, "avg": 0 },
  "httpReqDuration": { "min": 0, "max": 0, "avg": 0 },
  "httpReqs": 0,
  "dataReceived": 0,
  "dataSent": 0,
  "checks": { "passed": 0, "failed": 0 },
  "vus": { "min": 0, "max": 0, "value": 0 }
}
```

## Configuration

### Port

Default port is `3000`. To use a different port, set the PORT environment variable:

```bash
PORT=5000 npm start
```

## Dependencies

- **express** - Web framework for Node.js
- **cors** - Enable Cross-Origin Resource Sharing
- **multer** - Middleware for handling file uploads

## Technologies Used

- **Backend**: Node.js, Express
- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **File Format**: JSON

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)

## Troubleshooting

### File won't upload

- Ensure the file is a valid JSON file with `.json` extension
- Check that the file is not corrupted
- The file size should be reasonable (typically < 100MB)

### Metrics showing as "-"

- The uploaded file may not have the expected k6 metrics structure
- Check that your k6 test results JSON is properly formatted

### Port already in use

- Change the PORT environment variable to an available port
- Or stop the application using the current port

## Future Enhancements

- [ ] Export results as PDF/CSV
- [ ] Advanced filtering and search
- [ ] Custom metric charts and graphs
- [ ] Performance trend analysis
- [ ] Test result history and saved reports

## License

MIT

## Related Resources

- [K6 Documentation](https://k6.io/docs)
- [Express.js Guide](https://expressjs.com)
- [Node.js Documentation](https://nodejs.org/docs)

## Support

For issues, questions, or suggestions, please open an issue in the project repository.
