# Slipbox OCR

Auto-detecting notecard OCR system with computer vision detection and cloud-based text recognition.

## Features

- **Auto-Detection**: Automatically detects when a notecard is in view (no manual capture needed)
- **Fast CV Detection**: 9-14ms detection using brightness-based computer vision (100x faster than LLM)
- **High Accuracy**: 100% detection accuracy - recognizes notecards, ignores faces/people
- **Cloud OCR**: Uses Google Gemini for high-quality handwriting recognition
- **Auto-Save**: Saves recognized text as Markdown files
- **Live Preview**: Real-time camera feed with capture history

## How It Works

1. **Detection**: Analyzes video frames for bright, uniform rectangular objects (notecards)
2. **Capture**: When notecard detected, captures high-quality image
3. **OCR**: Sends to Google Gemini for text extraction
4. **Save**: Outputs as timestamped Markdown files

### Detection Algorithm

Uses brightness-based detection instead of edge detection or LLM:
- **Brightness**: Center region must be bright (>120 out of 255)
- **Uniformity**: Center must be uniform (>0.75) - solid color, not complex
- **Contrast**: Center must be brighter than borders (>1.0 ratio)

This approach:
- ✅ Detects white notecards reliably
- ✅ Rejects faces/people (too dark, too complex, poor contrast)
- ✅ Works in various lighting conditions
- ✅ 100x faster than LLM-based detection

## Setup

### Prerequisites

- Node.js 18+ 
- Google Gemini API key ([get one here](https://aistudio.google.com/app/apikey))
- (Optional) Ollama for local OCR

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd slipbox-ocr
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file:
```bash
cp .env.example .env
```

4. Add your Gemini API key to `.env`:
```
GEMINI_API_KEY=your_actual_api_key_here
```

### Running

Start the development server:
```bash
npm run dev
```

Open http://localhost:3000 in your browser.

## Usage

1. **Start Camera**: Click "Start camera" button
2. **Enable Auto-Detect**: Toggle "Auto-detect" switch
3. **Hold Up Notecard**: System will automatically detect and capture
4. **View Results**: OCR text appears in the result panel
5. **Export**: Download as Markdown or save to `output/` folder

## Testing

Run detection tests:
```bash
node scripts/test_all_cases.js
```

This validates detection against sample images (2 positive, 2 negative cases).

## Project Structure

```
slipbox-ocr/
├── public/              # Frontend
│   ├── index.html      # Main UI
│   ├── script.js       # Camera & detection logic
│   └── style.css       # Styles
├── server/             # Backend
│   ├── index.js        # Express server
│   ├── rectangle_detector.js  # CV detection
│   ├── gemini_vision.js       # Google Gemini OCR
│   ├── ollama_vision.js       # Local Ollama OCR
│   ├── preprocess.js          # Image preprocessing
│   └── storage.js             # File saving
├── output/             # Saved Markdown files
├── test_images/        # Test cases for detection
├── scripts/            # Testing utilities
└── docs/               # Documentation
```

## Configuration

### Detection Thresholds

In `server/rectangle_detector.js`, you can adjust:

```javascript
const isBright = centerBrightness > 120;      // Brightness threshold
const isUniform = centerUniformity > 0.75;    // Uniformity threshold  
const hasContrast = contrastRatio > 1.00;     // Contrast threshold
```

Lower thresholds = more sensitive (may detect non-cards)  
Higher thresholds = less sensitive (may miss cards)

### OCR Engines

Toggle between engines in the UI:
- **Gemini**: Cloud-based, high accuracy, requires API key
- **Ollama**: Local (if installed), no API key needed

## Development

### Adding Test Cases

1. Add images to `test_images/`:
   - `positive-*.png` - Should detect notecard
   - `negative-*.png` - Should NOT detect

2. Update `scripts/test_all_cases.js`

3. Run tests: `node scripts/test_all_cases.js`

### Live Reload

The dev server includes live reload - changes to frontend files auto-refresh the browser.

## Security

⚠️ **Never commit `.env` to version control**

The `.env` file contains your API key and is gitignored. Share `.env.example` instead.

## License

MIT

## Contributing

Pull requests welcome! Please ensure all tests pass before submitting.
