# Portfolio App User Manual

## Overview

**Portfolio App** is a Next.js-based web application designed for viewing and interacting with videos and images in a responsive, mobile-optimized gallery interface. The app features two main pages: a **Video Gallery** for browsing videos with hoverable WebM previews and metadata, and an **Image Gallery** for viewing images with infinite scrolling and popup previews. Both galleries support lazy loading, swipeable navigation, and dynamic styling via CSS custom properties, making the app highly customizable and performant. Includes **JSON Drawer** for viewing data on the fly and a couple of Python scripts for tagging images and generating site assets.

### Key Features
- **Video Gallery**:
  - Displays videos fetched from `/api/videos` with thumbnails and WebM previews on hover.
  - Supports filtering by file type (all, MP4, WebM) and searching by video name or tags.
  - Lazy loads 20 videos initially, with infinite scrolling for additional batches of 20.
  - Features a full-screen video player with navigation, looping, and swipe-to-close functionality.
  - Displays metadata (name, file type, duration, tags) on hover.
- **Image Gallery**:
  - Displays images fetched from `/api/gallery` with infinite scrolling (16 images per page).
  - Supports image popups with left/right navigation and swipe-to-close functionality.
  - Lazy loads images after the first 10, with priority loading for the first 4.
- **Responsive Design**:
  - Optimized for mobile screens with a flexible grid layout.
  - Uses CSS custom properties for dynamic column widths and styling, adjustable via a future settings component.
- **Styling**:
  - Uses the `OCR-A` font for a consistent, retro aesthetic.
  - Zoom-in animations on card hovers, with images and videos contained to their original sizes.
  - No shadows on thumbnails for a clean look.
- **Performance**:
  - Implements lazy loading and IntersectionObserver for efficient content loading.
  - Cleans up preview URLs to prevent memory leaks.
  - Uses Next.js Image component for optimized image loading.

## Prerequisites

- **Node.js**: Version 18.x or higher.
- **npm**: Version 8.x or higher.
- **Git**: For cloning the repository.
- **Browser**: Modern browsers (Chrome, Firefox, Safari, Edge) for optimal performance.
- **Font File**: Ensure `OCR-A.ttf` is placed in the `/public` folder for styling.

## Framework & Packages
- **next.js**: api/server
- **react typescript**: front end
- **shadcn-ui**: ui
- **radix-ui**: ui
- **tailwind-css**: css
- **ffmpeg**: processing
- **exiftools**: metadata
- **chalk**: logging
- **motion**: fx

## Installation

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/datadrip-ai/portfolio.git
   cd portfolio
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```
   This installs required packages, including:
   - `next`, `react`, `react-dom` for the Next.js framework.
   - `framer-motion` for animations.
   - `react-swipeable` for swipe gestures.
   - `lodash` for debouncing.
   - `papaparse` for parsing CSV tags (Videos).
   - `tailwindcss` for utility-first CSS.

3. **Add Font File**:
   - Place `OCR-A.ttf` in the `/public` folder (e.g., `/public/OCR-A.ttf`).
   - Verify the path matches the `@font-face` declaration in `globals.css`.

4. **Set Up API**:
   - Ensure the `/api/videos` endpoint returns video data in the format:
     
     ```bash
     curl http://localhost:3000/api/videos
     ```

     ```json
     [
       {
         "id": "video123",
         "name": "Sample Video",
         "url": "/videos/video123.mp4",
         "fileType": "mp4",
         "thumbnail": "/thumbnails/preview/video123.jpg",
         "preview": "/thumbnails/preview/video123.webm",
         "duration": 120,
         "createdAt": "2025-05-25T09:38:00Z"
       }
     ]
     ```
   - Ensure the `/api/gallery` endpoint returns image data in the format:
     
      ```bash
     curl http://localhost:3000/api/gallery
     ```
     
     ```json
     {
       "images": [
         { "image": "/images/image1.jpg", "ctime": "2025-05-25T09:38:00Z" }
       ]
     }
     ```
   - Place video and image files in `/public/videos` and `/public/thumbnails/preview` as needed.

5. **Run the Development Server**:
   ```bash
   npm run dev
   ```
   - Access the app at `http://localhost:3000` (or `http://10.0.0.75:3000` for network access).

## Project Structure

```
media-gallery-app/
├── public/
│   ├── OCR-A.ttf                # Font file
│   ├── thumbnails/preview/      # Thumbnails and WebM previews
│   ├── videos/                  # Video files
│   ├── images/                  # Image files
├── src/
│   ├── app/
│   │   ├── page.tsx             # Video Gallery page
│   │   ├── gallery/page.tsx     # Image Gallery page
│   │   ├── globals.css          # Global styles with CSS variables
│   ├── components/ui/
│   │   ├── nav.tsx              # Navigation component
│   │   ├── header.tsx           # Header with search/filter (Videos)
│   │   ├── services.tsx         # Services component (Gallery)
│   │   ├── button.tsx           # Button component
│   ├── lib/
│   │   ├── logger.ts            # Logger utility
├── package.json                 # Dependencies and scripts
```

## Usage

### Video Gallery (`/videos`)
Displays grid rows of video thumbnails with hoverable previews.

#### Features
- **Grid Layout**: Videos are displayed in a responsive grid with a default column width of 200px (customizable via `--gallery-column-width`).
- **Filtering**: Filter videos by type (All, MP4, WebM) using the dropdown in the header.
- **Search**: Search videos by name or tags using the search bar.
- **Lazy Loading**: Loads 20 videos initially, with 20 more loaded on scroll.
- **Hover Previews**: Hover over a thumbnail to play a WebM preview (after a 200ms delay).
- **Metadata**: Displays video name, file type, duration, and tags on hover.
- **Video Player**:
  - Click a video to open a full-screen player.
  - Navigate to previous/next videos using buttons or swipe left/right.
  - Toggle looping with the "Loop On/Off" button.
  - Close the player by clicking "Close" or swiping up/down.
- **Navigation**: Use "Prev" and "Next" buttons to navigate pages of videos.

#### How to Use
1. Visit `http://localhost:3000`.
2. Use the search bar to find videos by name or tags.
3. Select a file type from the dropdown to filter videos.
4. Scroll down to load more videos (20 at a time).
5. Hover over a video thumbnail to see a WebM preview.
6. Click a video to open the full-screen player.
7. Use navigation buttons or swipe gestures to browse videos.
8. Click "Refresh" in the header to reload video data.

### Image Gallery (`/`)
The Image Gallery displays a grid of images with infinite scrolling and popup previews.

#### Features
- **Grid Layout**: Images are displayed in a responsive grid with a default column width of 300px (customizable via `--gallery-column-width-gallery`).
- **Infinite Scrolling**: Loads 16 images per page, with more loaded as you scroll.
- **Lazy Loading**: Loads images after the first 10 lazily, with priority for the first 4.
- **Image Popup**:
  - Click an image to open a full-screen popup.
  - Navigate to previous/next images using buttons or swipe left/right.
  - Close the popup by clicking "Close" or swiping up/down.
- **No Shadows**: Thumbnails have no shadows for a clean look.
- **Zoom Animation**: Cards zoom in slightly on hover.

#### How to Use
1. Visit `http://localhost:3000/gallery`.
2. Scroll down to load more images (16 per page).
3. Click an image to open a full-screen popup.
4. Use navigation buttons or swipe left/right to browse images.
5. Swipe up/down or click "Close" to exit the popup.

### Styling Customization
The app uses CSS custom properties in `globals.css` for dynamic styling. To customize styles (e.g., column widths), you can:
- Override variables in a settings component (TBD) using inline styles, e.g.:
  ```tsx
  <div className="gallery-grid" style={{ "--gallery-column-width": "250px" }}>
  ```
- Modify defaults in `globals.css`:
  ```css
  :root {
    --gallery-column-width: 250px; /* Videos */
    --gallery-column-width-gallery: 350px; /* Gallery */
  }
  ```

### Navigation
- **Nav Component**: Shared across both pages, providing consistent navigation (implementation in `nav.tsx`).
- **Header (Videos)**: Includes search, filter, and refresh controls.
- **Services (Gallery)**: Displays additional UI elements (implementation in `services.tsx`).

## Technical Details

### Dependencies
- **Next.js**: Framework for server-side rendering and static site generation.
- **React**: For building interactive UI components.
- **Framer Motion**: For animations (e.g., card transitions, zoom-in effects).
- **React Swipeable**: For swipe gestures in popups.
- **Lodash**: For debouncing hover events.
- **PapaParse**: For parsing `/thumbnails/tags.csv` (Videos).
- **Tailwind CSS**: For utility-first styling.
- **OCR-A Font**: Custom font for a retro aesthetic.

### API Endpoints
- **`/api/videos`**:
  - Returns video metadata with fields: `id`, `name`, `url`, `fileType`, `thumbnail`, `preview`, `duration`, `createdAt`.
  - Example response:
    ```json
    [
      {
        "id": "video123",
        "name": "Sample Video",
        "url": "/videos/video123.mp4",
        "fileType": "mp4",
        "thumbnail": "/thumbnails/preview/video123.jpg",
        "preview": "/thumbnails/preview/video123.webm",
        "duration": 120,
        "createdAt": "2025-05-25T09:38:00Z"
      }
    ]
    ```
- **`/api/gallery`**:
  - Returns image metadata with fields: `image`, `ctime`.
  - Example response:
    ```json
    {
      "images": [
        { "image": "/images/image1.jpg", "ctime": "2025-05-25T09:38:00Z" }
      ]
    }
    ```

### Styling
- **Font**: Uses `OCR-A` (served from `/public/OCR-A.ttf`) for all text.
- **Layout**: Responsive grid with dynamic column widths (`--gallery-column-width`, `--gallery-column-width-gallery`).
- **Animations**:
  - Cards fade in on load and zoom in on hover (scale to 1.05).
  - Video previews pulse with brightness animation.
- **Metadata (Videos)**: Displays name, file type, duration, and tags in bubbles on hover.
- **No Shadows**: Thumbnails have no shadows for a clean appearance.
- **Popup**: Full-screen media viewer with navigation controls and swipe gestures.

### Performance Optimizations
- **Lazy Loading**: Images and videos load lazily after the initial set (20 for Videos, 10 for Gallery).
- **Priority Loading**: First 4 items in both galleries load with priority.
- **IntersectionObserver**: Triggers infinite scrolling efficiently.
- **URL Cleanup**: Revokes preview URLs to prevent memory leaks.
- **Next.js Image**: Optimizes image loading with compression and responsive sizes.

## Troubleshooting

### Common Issues
1. **Videos/Images Not Loading**:
   - Verify files exist in `/public/videos`, `/public/thumbnails/preview`, or `/public/images`.
   - Check API responses for correct `url`, `thumbnail`, and `preview` paths.
   - Ensure CORS is configured if assets are served from a different domain.
2. **Font Not Loading**:
   - Confirm `OCR-A.ttf` is in `/public/OCR-A.ttf`.
   - Check browser console for 404 errors on font loading.
3. **Infinite Scroll Not Working**:
   - Ensure `load-more` div is present and visible.
   - Check `IntersectionObserver` logs in the console.
4. **Swipe Gestures Not Working**:
   - Verify `react-swipeable` is installed (`npm install react-swipeable`).
   - Test on a touch-enabled device or browser emulator.
5. **Styling Issues**:
   - Check `globals.css` for correct CSS variable values.
   - Ensure Tailwind CSS is properly integrated (`@import "tailwindcss"`).

### Debugging
- Open browser DevTools (F12) and check the **Network** tab for failed requests.
- Review the **Console** for errors (e.g., API failures, image/video load errors).
- Enable logging in `lib/logger.ts` for detailed debug output.

## Development

### Running in Development
```bash
npm run dev
```
- Access at `http://localhost:3000` or `http://10.0.0.75:3000` for network access.
- Use `--hostname 0.0.0.0` to allow external access:
  ```bash
  npm run dev -- --hostname 0.0.0.0
  ```

### Building for Production
```bash
npm run build
npm run start
```
- Ensure all static assets are in `/public`.
- Verify API endpoints are accessible in production.
- Running npm build will run the tagging script to generate thumbnail assets

### Customizing Styles
- Edit `globals.css` to adjust CSS variables (e.g., `--gallery-column-width`).
- Implement a settings component to pass dynamic props, e.g.:
  ```tsx
  function Settings({ onColumnWidthChange }) {
    return (
      <input
        type="range"
        min="100"
        max="500"
        onChange={(e) => onColumnWidthChange(`${e.target.value}px`)}
      />
    );
  }
  ```

## Future Improvements
- **Settings Component**: Add a UI to adjust column widths and other styles dynamically.
- **Tag Management**: Implement tag filtering UI for the Image Gallery.
- **Error Handling**: Enhance error messages for failed API requests or asset loading.
- **Accessibility**: Add ARIA labels and keyboard navigation for improved accessibility.
- **Performance**: Optimize video previews with lower resolution or shorter clips.
- **Interface**: Optimize JSON viewer, readability, transitions, animations, etc
- **Tagging**: Optimize tagging scripts to use transformers, WD-tagging or BLIP caption description or manual captioning automation
- **Paths**: Change paths to an INI file rather than using env variables
- **Middleware**: Expand support for SSL and session management
- **Pages**: Create landing page and move gallery to /gallery

## Issues
- Video lengths not loading
- Previews are clunky

## License
This project is licensed under the MIT License. See the `LICENSE` file for details.

## Contact
For support or contributions open an issue on the [GitHub repository](https://github.com/datadrip-ai/portfolio).

## Todo
Fix video durations at video api
Filter by tags
Expand filtering

## Change Log
Separate cards for image/videos