/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { useSwipeable } from "react-swipeable";
import { Button } from "@/components/ui/button";
import Nav from "@/components/ui/nav";
import "@/globals.css";

interface ImageItem {
  image: string;
  name: string;
  captions: string;
  tags: string[];
  ctime: string;
  mtime: string;
}

interface BackgroundVideo {
  video: string;
  name: string;
}

const Spinner = () => (
  <div className="flex justify-center items-center h-32">
    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[rgba(26,191,255,1)]"></div>
  </div>
);

const LoadingBar = ({ progress }: { progress: number }) => (
  <div className="fixed top-0 left-0 w-full h-1.5 bg-gray-900 z-[1000]">
    <div
      className="h-full bg-[rgba(26,191,255,0.3)] transition-all duration-300 ease-in-out"
      style={{ width: `${progress}%` }}
    />
  </div>
);

const FALLBACK_IMAGE = {
  src: "/images/fallback.jpg",
  width: 250,
  height: 187.5,
};

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  state = { hasError: false };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error(`ErrorBoundary caught error: ${error.message}, info: ${JSON.stringify(errorInfo)}`);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="text-center p-4">
          <p className="text-sm text-red-500">Something went wrong: {this.state.error?.message || "Unknown error"}</p>
          <Button onClick={() => window.location.reload()} aria-label="Retry">
            Retry
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

const Slideshow: React.FC<{
  images: ImageItem[];
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  currentSlide: number;
  setCurrentSlide: (index: number) => void;
  selectedBackground: string | null;
  backgroundPosition: string;
  loopBackground: boolean;
  imageOpacity: number;
  backgroundOpacity: number;
  imageBlur: number;
  backgroundBlur: number;
  displayMode: boolean;
  backgroundMode: "current-image" | "clip";
}> = ({
  images,
  isPlaying,
  setIsPlaying,
  currentSlide,
  setCurrentSlide,
  selectedBackground,
  backgroundPosition,
  loopBackground,
  imageOpacity,
  backgroundOpacity,
  imageBlur,
  backgroundBlur,
  displayMode,
  backgroundMode,
}) => {
  const [transitionDuration, setTransitionDuration] = useState(5);
  const slideshowRef = useRef<NodeJS.Timeout | null>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [showCopyButton, setShowCopyButton] = useState(false);

  const nextSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev + 1) % images.length);
  }, [images.length, setCurrentSlide]);

  useEffect(() => {
    if (isPlaying && images.length > 0) {
      slideshowRef.current = setInterval(nextSlide, transitionDuration * 1000 + 1000);
    }
    return () => {
      if (slideshowRef.current) clearInterval(slideshowRef.current);
    };
  }, [isPlaying, images.length, nextSlide, transitionDuration]);

  const swipeHandlers = useSwipeable({
    onSwipedLeft: () => {
      setIsPlaying(false);
      nextSlide();
    },
    onSwipedRight: () => {
      setIsPlaying(false);
      setCurrentSlide((prev) => (prev - 1 + images.length) % images.length);
    },
    delta: 10,
    trackTouch: true,
    trackMouse: false,
  });

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(images[currentSlide].image);
      alert("Image URL copied to clipboard!");
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  const handleMouseEnter = () => {
    hoverTimeoutRef.current = setTimeout(() => setShowCopyButton(true), 500);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setShowCopyButton(false);
  };

  if (images.length === 0 || !images[currentSlide]) return null;

  return (
    <div
      className={`relative w-full h-screen overflow-hidden bg-[rgba(0,10,20,0.9)] border-2 border-[rgba(26,191,255,0.2)] rounded-xl ${
        displayMode ? "grid grid-cols-2 gap-4 p-4" : ""
      }`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className={`absolute inset-0 z-0 ${displayMode ? "relative h-full" : ""}`}>
        {backgroundMode === "clip" && selectedBackground ? (
          <video
            src={selectedBackground}
            autoPlay
            loop={loopBackground}
            muted
            playsInline
            className={`object-cover w-full h-full ${
              backgroundPosition === "center-left" ? "object-left" : backgroundPosition === "clip-right" ? "object-right" : ""
            }`}
            style={{ opacity: backgroundOpacity, filter: `blur(${backgroundBlur}px)` }}
            onError={(e) => {
              console.error(`Failed to load background video: ${e.currentTarget.src}`);
              e.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <Image
            src={`/images/${images[currentSlide].name}`}
            alt="Background"
            fill
            quality={80}
            className="object-cover"
            style={{ opacity: backgroundOpacity, filter: `blur(${backgroundBlur}px)` }}
            onError={(e) => {
              console.error(`Failed to load background: ${e.currentTarget.src}`);
              e.currentTarget.src = FALLBACK_IMAGE.src;
            }}
          />
        )}
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={`slide-${currentSlide}`}
          className={`z-10 ${displayMode ? "relative h-full" : "absolute inset-4"}`}
          style={{
            maskImage: "radial-gradient(circle at center, rgba(0,0,0,1) 10%, rgba(0,0,0,0) 70%)",
            WebkitMaskImage: "radial-gradient(circle at center, rgba(0,0,0,1) 10%, rgba(0,0,0,0) 70%)",
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          {...swipeHandlers}
        >
          {images[currentSlide].image.endsWith(".webm") || images[currentSlide].image.endsWith(".mp4") ? (
            <video
              src={`/images/${images[currentSlide].name}`}
              controls
              autoPlay
              className="object-contain w-full h-full rounded-xl"
              style={{ opacity: imageOpacity, filter: `blur(${imageBlur}px)` }}
              onError={(e) => {
                console.error(`Failed to load video: ${e.currentTarget.src}`);
                e.currentTarget.poster = FALLBACK_IMAGE.src;
              }}
            />
          ) : (
            <Image
              src={`/images/${images[currentSlide].name}`}
              alt={images[currentSlide].captions}
              width={1024}
              height={1024}
              quality={90}
              className="object-contain w-full h-full rounded-xl"
              style={{ opacity: imageOpacity, filter: `blur(${imageBlur}px)` }}
              onError={(e) => {
                console.error(`Failed to load image: ${e.currentTarget.src}`);
                e.currentTarget.src = FALLBACK_IMAGE.src;
              }}
            />
          )}
          <div className="absolute bottom-8 left-8 bg-[rgba(0,0,0,0.7)] p-2 rounded-md">
            <p className="text-white">{images[currentSlide].captions}</p>
            {images[currentSlide].tags.length > 0 && (
              <p className="text-sm text-[rgba(26,191,255,0.6)]">{images[currentSlide].tags.join(", ")}</p>
            )}
            <p className="text-sm text-[rgba(26,191,255,0.6)]">
              Created: {new Date(images[currentSlide].ctime).toLocaleDateString()}
            </p>
            <p className="text-sm text-[rgba(26,191,255,0.6)]">
              Modified: {new Date(images[currentSlide].mtime).toLocaleDateString()}
            </p>
          </div>
          {showCopyButton && (
            <Button
              className="absolute top-8 right-8 bg-[rgba(26,191,255,0.6)] hover:bg-[rgba(26,191,255,0.8)]"
              onClick={handleCopy}
              aria-label="Copy image URL"
            >
              Copy URL
            </Button>
          )}
        </motion.div>
      </AnimatePresence>
      <div className="absolute top-4 right-4 flex flex-col gap-2 z-20 bg-[rgba(0,0,0,0.5)] p-4 rounded-md">
        <Button
          className="s1"
          onClick={() => setIsPlaying(!isPlaying)}
          aria-label={isPlaying ? "Pause slideshow" : "Play slideshow"}
        >
          {isPlaying ? "Pause" : "Play"}
        </Button>
        <Button
          className="s1"
          onClick={() => {
            setIsPlaying(false);
            nextSlide();
          }}
          aria-label="Next slide"
        >
          →
        </Button>
        <div className="flex items-center gap-2">
          <label htmlFor="transition-duration" className="text-sm text-[rgba(26,191,255,0.6)]">
            Transition (s):
          </label>
          <input
            id="transition-duration"
            type="number"
            min="1"
            max="10"
            value={transitionDuration}
            onChange={(e) => setTransitionDuration(Number(e.target.value))}
            className="w-16 p-1 rounded-md bg-[rgba(32,32,32,0.5)] text-[rgba(26,191,255,0.9)] border border-[rgba(26,191,255,0.6)]"
            aria-label="Set transition duration"
          />
        </div>
      </div>
    </div>
  );
};

const Gallery: React.FC = () => {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [filteredImages, setFilteredImages] = useState<ImageItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [nameFilter, setNameFilter] = useState("");
  const [sortBy, setSortBy] = useState<"ctime" | "mtime" | "name">("ctime");
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [refreshRate, setRefreshRate] = useState<number>(0);
  const [isSlideshowPlaying, setIsSlideshowPlaying] = useState(true);
  const [visibleImages, setVisibleImages] = useState<ImageItem[]>([]);
  const [startIndex, setStartIndex] = useState(0);
  const [backgroundVideos, setBackgroundVideos] = useState<BackgroundVideo[]>([]);
  const [selectedBackground, setSelectedBackground] = useState<string | null>(null);
  const [backgroundPosition, setBackgroundPosition] = useState<"center" | "center-left" | "clip-right">("center");
  const [loopBackground, setLoopBackground] = useState(true);
  const [randomBackground, setRandomBackground] = useState(false);
  const [randomLoopBackground, setRandomLoopBackground] = useState(false);
  const [imageOpacity, setImageOpacity] = useState(1);
  const [backgroundOpacity, setBackgroundOpacity] = useState(0.5);
  const [imageBlur, setImageBlur] = useState(0);
  const [backgroundBlur, setBackgroundBlur] = useState(0);
  const [displayMode, setDisplayMode] = useState<boolean>(false);
  const [backgroundMode, setBackgroundMode] = useState<"current-image" | "clip">("current-image");
  const galleryRef = useRef<HTMLDivElement | null>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const IMAGES_PER_LOAD = 20;

  const fetchImages = useCallback(async () => {
    setIsLoading(true);
    setLoadProgress(0);
    try {
      const response = await fetch(`/api/gallery${nameFilter ? `?name=${encodeURIComponent(nameFilter)}` : ""}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      const enhancedImages = data.media.map((item: { image: string; ctime: string; mtime: string; name: string }, i: number) => ({
        image: `/images/${item.name}`,
        captions: `Image ${item.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ") || i + 1}`,
        tags: [`tag${(i % 5) + 1}`, `category${(i % 3) + 1}`],
        ctime: item.ctime,
        mtime: item.mtime,
        name: item.name,
      }));

      enhancedImages.slice(0, IMAGES_PER_LOAD).forEach((img) => {
        const link = document.createElement("link");
        link.rel = "preload";
        link.as = "image";
        link.href = img.image;
        document.head.appendChild(link);
      });

      setImages(enhancedImages);
      setFilteredImages(enhancedImages);
      setVisibleImages(enhancedImages.slice(0, IMAGES_PER_LOAD));
      setStartIndex(IMAGES_PER_LOAD);
      setLoadProgress(100);
    } catch (error) {
      console.error("Failed to fetch images:", (error as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [nameFilter]);

  const fetchBackgroundVideos = useCallback(async () => {
    try {
      const response = await fetch("/api/gallery?type=background&path=/public/images/clips", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      const bgVideos = Array.isArray(data.media)
        ? data.media.map((item: { image: string; name: string }) => ({
            video: `/images/clips/${item.name}`,
            name: item.name,
          }))
        : [];
      setBackgroundVideos(bgVideos);
      if (bgVideos.length > 0 && !selectedBackground && backgroundMode === "clip") {
        setSelectedBackground(bgVideos[0].video);
      }
    } catch (error) {
      console.error("Failed to fetch background videos:", (error as Error).message);
      setBackgroundVideos([]);
    }
  }, [selectedBackground, backgroundMode]);

  const handleRandomBackground = useCallback(() => {
    if (backgroundVideos.length > 0) {
      setSelectedBackground(backgroundVideos[Math.floor(Math.random() * backgroundVideos.length)].video);
    }
  }, [backgroundVideos]);

  const shuffleImages = () => {
    const shuffled = [...filteredImages].sort(() => Math.random() - 0.5);
    setFilteredImages(shuffled);
    setVisibleImages(shuffled.slice(0, IMAGES_PER_LOAD));
    setStartIndex(IMAGES_PER_LOAD);
    setCurrentSlide(0);
  };

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (randomBackground || randomLoopBackground) {
      handleRandomBackground();
      if (randomLoopBackground && backgroundMode === "clip") {
        interval = setInterval(handleRandomBackground, 30000);
      }
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [randomBackground, randomLoopBackground, handleRandomBackground, backgroundMode]);

  const handleSearch = useCallback(() => {
    let filtered = [...images];
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (img) =>
          img.image.toLowerCase().includes(query) ||
          img.captions.toLowerCase().includes(query) ||
          img.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    }
    if (nameFilter) {
      filtered = filtered.filter((img) => img.name.toLowerCase().includes(nameFilter.toLowerCase()));
    }
    if (sortBy === "ctime") {
      filtered.sort((a, b) => new Date(b.ctime).getTime() - new Date(a.ctime).getTime());
    } else if (sortBy === "mtime") {
      filtered.sort((a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime());
    } else if (sortBy === "name") {
      filtered.sort((a, b) => a.name.localeCompare(b.name));
    }
    setFilteredImages(filtered);
    setVisibleImages(filtered.slice(0, IMAGES_PER_LOAD));
    setStartIndex(IMAGES_PER_LOAD);
  }, [searchQuery, nameFilter, sortBy, images]);

  const loadMoreImages = useCallback(() => {
    const nextIndex = startIndex + IMAGES_PER_LOAD;
    const newImages = filteredImages.slice(startIndex, nextIndex);
    if (newImages.length === 0) {
      setVisibleImages((prev) => [...prev, ...filteredImages.slice(0, IMAGES_PER_LOAD)]);
      setStartIndex(IMAGES_PER_LOAD);
    } else {
      setVisibleImages((prev) => [...prev, ...newImages]);
      setStartIndex(nextIndex);
    }
  }, [filteredImages, startIndex]);

  const handlePrevPage = () => {
    const prevIndex = Math.max(0, startIndex - IMAGES_PER_LOAD * 2);
    setVisibleImages(filteredImages.slice(prevIndex, prevIndex + IMAGES_PER_LOAD));
    setStartIndex(prevIndex + IMAGES_PER_LOAD);
    if (galleryRef.current) {
      galleryRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleNextPage = () => {
    loadMoreImages();
    if (galleryRef.current) {
      galleryRef.current.scrollTo({ top: galleryRef.current.scrollHeight, behavior: "smooth" });
    }
  };

  useEffect(() => {
    fetchImages();
    fetchBackgroundVideos();
  }, [fetchImages, fetchBackgroundVideos]);

  useEffect(() => {
    handleSearch();
  }, [searchQuery, nameFilter, sortBy, handleSearch]);

  useEffect(() => {
    if (refreshRate > 0) {
      refreshIntervalRef.current = setInterval(fetchImages, refreshRate * 1000);
      return () => {
        if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
      };
    }
  }, [refreshRate, fetchImages]);

  useEffect(() => {
    if (loadMoreRef.current) {
      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) loadMoreImages();
        },
        { threshold: 0.1 }
      );
      observerRef.current.observe(loadMoreRef.current);
    }
    return () => {
      if (observerRef.current) observerRef.current.disconnect();
    };
  }, [loadMoreImages]);

  const handleRefresh = () => {
    setSearchQuery("");
    setNameFilter("");
    setSortBy("ctime");
    setVisibleImages(images.slice(0, IMAGES_PER_LOAD));
    setStartIndex(IMAGES_PER_LOAD);
    fetchImages();
  };

  const handleImageClick = (index: number) => {
    setCurrentSlide(index);
    setIsSlideshowPlaying(false);
  };

  return (
    <ErrorBoundary>
      <div className="app-container">
        <Nav />
        <meta httpEquiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
        <meta httpEquiv="Pragma" content="no-cache" />
        <meta httpEquiv="Expires" content="0" />
        {loadProgress < 100 && <LoadingBar progress={loadProgress} />}
        <div className="gallery flex">
          <div className="gallery-sidebar bg-[rgba(10,20,30,0.95)] border-2 border-[rgba(26,191,255,0.2)] rounded-xl p-4 m-2">
            <div className="sticky top-0 z-10 bg-[rgba(0,0,0,0.9)] p-3 rounded-lg">
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Search captions/tags..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="col-span-2 p-2 rounded-md bg-[rgba(32,32,32,0.5)] text-[rgba(26,191,255,0.9)] border border-[rgba(26,191,255,0.6)]"
                  aria-label="Search images by captions or tags"
                />
                <input
                  type="text"
                  placeholder="Filter by name..."
                  value={nameFilter}
                  onChange={(e) => setNameFilter(e.target.value)}
                  className="col-span-2 p-2 rounded-md bg-[rgba(32,32,32,0.5)] text-[rgba(26,191,255,0.9)] border border-[rgba(26,191,255,0.6)]"
                  aria-label="Filter images by name"
                />
                <Button
                  className="s1 col-span-1"
                  onClick={handleSearch}
                  disabled={isLoading}
                  aria-label="Search images"
                >
                  Search
                </Button>
                <Button
                  className="s1 col-span-1"
                  onClick={shuffleImages}
                  aria-label="Shuffle images"
                >
                  Shuffle
                </Button>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as "ctime" | "mtime" | "name")}
                  className="col-span-1 p-2 rounded-lg glass-effect"
                  aria-label="Sort images"
                >
                  <option value="ctime">Creation Time</option>
                  <option value="mtime">Modified Time</option>
                  <option value="name">Alphabetical</option>
                </select>
                <select
                  value={backgroundMode}
                  onChange={(e) => {
                    setBackgroundMode(e.target.value as "current-image" | "clip");
                    if (e.target.value === "current-image") {
                      setSelectedBackground(null);
                      setRandomBackground(false);
                      setRandomLoopBackground(false);
                    }
                  }}
                  className="col-span-1 p-2 rounded-lg glass-effect"
                  aria-label="Select background mode"
                >
                  <option value="current-image">Image</option>
                  <option value="clip">Clip</option>
                </select>
                <div className="col-span-2 bg-[rgba(15,25,35,1)] border-4 border-[rgba(26,191,255,0.4)] rounded-xl p-3">
                  <h3 className="text-sm font-bold text-[rgba(26,191,255,1)] mb-2">Background Settings</h3>
                  {backgroundMode === "clip" && (
                    <>
                      <select
                        value={selectedBackground || ""}
                        onChange={(e) => {
                          const value = e.target.value || null;
                          setSelectedBackground(value);
                          setRandomBackground(false);
                          setRandomLoopBackground(false);
                        }}
                        className="col-span-2 p-2 rounded-lg glass-effect clip-dropdown"
                        aria-label="Select background clip"
                      >
                        <option value="" disabled>Select a clip</option>
                        {backgroundVideos.length === 0 ? (
                          <option value="" disabled>No clips available</option>
                        ) : (
                          backgroundVideos.map((bg) => (
                            <option key={bg.video} value={bg.video} data-img={bg.video}>
                              {bg.name}
                            </option>
                          ))
                        )}
                      </select>
                      <div className="flex col-span-2 gap-2 mt-2">
                        <Button
                          className="s1 bg-yellow-600 hover:bg-yellow-500"
                          onClick={() => {
                            setRandomBackground(true);
                            setRandomLoopBackground(false);
                            setLoopBackground(false);
                            handleRandomBackground();
                          }}
                          aria-label="Random clip"
                        >
                          Random
                        </Button>
                        <Button
                          className="s1 bg-blue-600 hover:bg-blue-700"
                          onClick={() => {
                            setLoopBackground(true);
                            setRandomBackground(false);
                            setRandomLoopBackground(false);
                          }}
                          aria-label="Loop clip"
                        >
                          Loop
                        </Button>
                        <Button
                          className="s1 bg-green-600 hover:bg-green-700"
                          onClick={() => {
                            setLoopBackground(false);
                            setRandomBackground(false);
                            setRandomLoopBackground(false);
                          }}
                          aria-label="Play clip once"
                        >
                          One
                        </Button>
                        <Button
                          className="s1 bg-purple-600 hover:bg-purple-700"
                          onClick={() => {
                            setRandomLoopBackground(true);
                            setRandomBackground(false);
                            setLoopBackground(true);
                            handleRandomBackground();
                          }}
                          aria-label="Random loop clip"
                        >
                          Randomize
                        </Button>
                      </div>
                    </>
                  )}
                  <select
                    value={backgroundPosition}
                    onChange={(e) => setBackgroundPosition(e.target.value as "center" | "center-left" | "clip-right")}
                    className="col-span-1 p-2 rounded-lg glass-effect mt-2"
                    aria-label="Select background position"
                  >
                    <option value="center">Center</option>
                    <option value="center-left">Center Left</option>
                    <option value="clip-right">Right</option>
                  </select>
                  <div className="col-span-1 flex items-center gap-2 mt-2">
                    <label htmlFor="image-opacity" className="text-sm font-medium text-[rgba(26,191,255,0.6)]">
                      Image Opacity
                    </label>
                    <input
                      id="image-opacity"
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={imageOpacity}
                      onChange={(e) => {
                        console.log("Image Opacity:", Number(e.target.value));
                        setImageOpacity(Number(e.target.value));
                      }}
                      className="w-full"
                      aria-label="Adjust image opacity"
                    />
                  </div>
                  <div className="col-span-1 flex items-center gap-2 mt-2">
                    <label htmlFor="background-opacity" className="text-sm font-medium text-[rgba(26,191,255,0.6)]">
                      BG Opacity
                    </label>
                    <input
                      id="background-opacity"
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={backgroundOpacity}
                      onChange={(e) => {
                        console.log("Background Opacity:", Number(e.target.value));
                        setBackgroundOpacity(Number(e.target.value));
                      }}
                      className="w-full"
                      aria-label="Adjust background opacity"
                    />
                  </div>
                  <div className="col-span-1 flex items-center gap-2 mt-2">
                    <label htmlFor="image-blur" className="text-sm font-medium text-[rgba(26,191,255,0.6)]">
                      Image Blur (px)
                    </label>
                    <input
                      id="image-blur"
                      type="range"
                      min="0"
                      max="20"
                      step="1"
                      value={imageBlur}
                      onChange={(e) => {
                        console.log("Image Blur:", Number(e.target.value));
                        setImageBlur(Number(e.target.value));
                      }}
                      className="w-full"
                      aria-label="Adjust image blur"
                    />
                  </div>
                  <div className="col-span-1 flex items-center gap-2 mt-2">
                    <label htmlFor="background-blur" className="text-sm font-medium text-[rgba(26,191,255,0.6)]">
                      BG Blur (px)
                    </label>
                    <input
                      id="background-blur"
                      type="range"
                      min="0"
                      max="20"
                      step="1"
                      value={backgroundBlur}
                      onChange={(e) => {
                        console.log("Background Blur:", Number(e.target.value));
                        setBackgroundBlur(Number(e.target.value));
                      }}
                      className="w-full"
                      aria-label="Adjust background blur"
                    />
                  </div>
                  <div className="col-span-1 flex items-center gap-2 mt-2">
                    <label className="flex items-center gap-1 text-sm font-medium text-[rgba(26,191,255,0.6)]">
                      <input
                        type="checkbox"
                        checked={displayMode}
                        onChange={(e) => setDisplayMode(e.target.checked)}
                        aria-label="Toggle side-by-side mode"
                      />
                      Side-by-Side
                    </label>
                  </div>
                </div>
                <Button
                  className="s1 col-span-1 mt-2"
                  onClick={handleRefresh}
                  disabled={isLoading}
                  aria-label="Refresh gallery"
                >
                  {isLoading ? "Loading..." : "Refresh"}
                </Button>
                <select
                  id="refresh-rate"
                  value={refreshRate}
                  onChange={(e) => setRefreshRate(Number(e.target.value))}
                  className="col-span-1 p-2 rounded-lg mt-2 glass-effect"
                  aria-label="Select auto-refresh rate"
                >
                  <option value="0">Auto-refresh Off</option>
                  <option value="30">Every 30s</option>
                  <option value="60">Every 1m</option>
                  <option value="300">Every 5m</option>
                </select>
              </div>
            </div>
            {isLoading && images.length === 0 ? (
              <Spinner className="mt-4" />
            ) : (
              <div className="gallery-grid">
                {visibleImages.length === 0 ? (
                  <p className="no-content text-center">No items found</p>
                ) : (
                  visibleImages.map((item, index) => (
                    <motion.div
                      key={`${item.image}-${index}`}
                      className="media-card-image"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{}}
                      transition={{ duration: 0.5 }}
                      onClick={() => handleImageClick(index)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) =>
                        (e.key === "Enter" || e.key === " ") &&
                        handleImageClick(index)
                      }
                      aria-label={`View ${item.captions}`}
                    >
                      {item.image.endsWith(".webm") || item.image.endsWith(".mp4") ? (
                        <video
                          src={`/images/${item.name}`}
                          muted
                          className="media-thumbnail object-cover"
                          onError={(e) => {
                            console.error(`Failed to load thumbnail: ${e.currentTarget.src}`);
                            e.currentTarget.poster = FALLBACK_IMAGE.src;
                          }}
                        />
                      ) : (
                        <Image
                          src={`/images/${item.name}`}
                          alt={item.captions}
                          width={250}
                          height={187.5}
                          quality={75}
                          className="media-thumbnail object-cover"
                          loading={index > 2 ? "lazy" : undefined}
                          priority={index <= 2}
                          placeholder="blur"
                          blurDataURL={`/_next/image?url=${encodeURIComponent(item.image)}&w=16&q=10`}
                          onError={(e) => {
                            console.error(`Failed to load thumbnail: ${e.currentTarget.src}`);
                            e.currentTarget.src = FALLBACK_IMAGE.src;
                          }}
                        />
                      )}
                      <div className="metadata-bubble metadata-captions">{item.captions}</div>
                      <div className="metadata-bubble metadata-top-left">
                        Created: {new Date(item.ctime).toLocaleDateString()}
                      </div>
                      <div className="metadata-bubble metadata-bottom-right">
                        Modified: {new Date(item.mtime).toLocaleDateString()}
                      </div>
                    </motion.div>
                  ))
                )}
                <div ref={loadMoreRef} className="load-more"></div>
              </div>
            )}
            <div className="pagination-controls bg-[#0A1414] p-2 m-2 rounded-lg">
              <Button
                className="s1"
                onClick={handlePrevPage}
                disabled={startIndex <= IMAGES_PER_LOAD}
                aria-label="Previous page"
              >
                ←
              </Button>
              <Button
                className="s1"
                onClick={handleNextPage}
                aria-label="Next page"
              >
                →
              </Button>
            </div>
          </div>
          <div className="slideshow-container m-2">
            <Slideshow
              images={filteredImages}
              isPlaying={isSlideshowPlaying}
              setIsPlaying={setIsSlideshowPlaying}
              currentSlide={currentSlide}
              setCurrentSlide={setCurrentSlide}
              selectedBackground={selectedBackground}
              backgroundPosition={backgroundPosition}
              loopBackground={loopBackground}
              imageOpacity={imageOpacity}
              backgroundOpacity={backgroundOpacity}
              imageBlur={imageBlur}
              backgroundBlur={backgroundBlur}
              displayMode={displayMode}
              backgroundMode={backgroundMode}
            />
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default Gallery;