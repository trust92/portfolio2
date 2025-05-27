/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { useSwipeable } from "react-swipeable";
import "@/globals.css";
import { Button } from "@/components/ui/button";
import Nav from "@/components/ui/nav";
import Footer from "@/components/ui/footer";

const Gallery = () => {
  const [images, setImages] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [selectedImage, setSelectedImage] = useState(null);
  const [scrollPosition, setScrollPosition] = useState(0);
  const galleryRef = useRef(null);
  const loadMoreRef = useRef(null);

  /* Fetch images from API */
  const fetchImages = async () => {
    try {
      const response = await fetch('/api/captions?type=Image');
      if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
      const data = await response.json();
      const newImages = data.images.map((item: Image) => ({
        image: item.image,
        timestamp: new Date(item.ctime).getTime(),
        captions: item.captions,
        tags: item.tags,
      }));
      setImages((current) => {
        const uniqueImages = newImages.filter(
          (newImg: { image: any; }) => !current.some((img) => img.image === newImg.image)
        );
        return [...current, ...uniqueImages].slice(0, page * 20);
      });
      setHasMore(newImages.length > 0);
    } catch (error) {
      console.error('Failed to fetch images:', error.message);
    }
  };

  /* Fetch on page change */
  useEffect(() => {
    fetchImages();
  }, [fetchImages, page]);

  /* Infinite scroll */
  useEffect(() => {
    if (!hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setPage((page) => page + 1);
      },
      { threshold: 0.1 }
    );
    if (loadMoreRef.current) observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [hasMore]);

  /* Handle image selection */
  const handleImageClick = (img) => {
    setScrollPosition(window.scrollY);
    setSelectedImage(img);
  };

  /* Close image popup */
  const handleClosePopup = () => {
    setSelectedImage(null);
    window.scrollTo({ top: scrollPosition, behavior: "auto" });
  };

  /* Navigate to previous image */
  const handlePrevImage = () => {
    const currentIndex = images.findIndex((img) => img.image === selectedImage?.image);
    if (currentIndex > 0) {
      setSelectedImage(images[currentIndex - 1]);
    }
  };

  /* Navigate to next image */
  const handleNextImage = () => {
    const currentIndex = images.findIndex((img) => img.image === selectedImage?.image);
    if (currentIndex < images.length - 1) {
      setSelectedImage(images[currentIndex + 1]);
    }
  };

  /* Swipe handlers for popup */
  const swipeHandlers = useSwipeable({
    onSwipedLeft: handleNextImage,
    onSwipedRight: handlePrevImage,
    onSwipedUp: handleClosePopup,
    onSwipedDown: handleClosePopup,
    delta: 10,
    trackTouch: true,
    trackMouse: false,
  });

  return (
    <div className="app-container">
      <Nav />
      {selectedImage && (
  <div className="media-popup" {...swipeHandlers}>
    <div className="media-popup-content">
      <div className="media-popup-controls"></div>
      <div className="metadata-bubble metadata-captions">{selectedImage.captions}</div>
    </div>
  </div>
)}
      <div className="gallery" ref={galleryRef}>
        {selectedImage ? (
          <div className="media-popup" {...swipeHandlers}>
            <div className="media-popup-content">
              <div className="media-popup-controls">
                <Button
                  variant="outline"
                  className="nav-button"
                  onClick={handlePrevImage}
                  disabled={images.findIndex((img) => img.image === selectedImage.image) === 0}
                >
                  ←
                </Button>
                <Button
                  variant="outline"
                  className="nav-button"
                  onClick={handleNextImage}
                  disabled={
                    images.findIndex((img) => img.image === selectedImage.image) ===
                    images.length - 1
                  }
                >
                  →
                </Button>
                <Button
                  variant="outline"
                  className="nav-button"
                  onClick={handleClosePopup}
                >
                  Close
                </Button>
              </div>
              <Image
                src={selectedImage.image}
                alt="Selected Image"
                width={800}
                height={600}
                quality={100}
                className="media-content"
                style={{ objectFit: "contain" }}
                onError={() => console.error(`Failed to load: ${selectedImage.image}`)}
              />
            </div>
          </div>
        ) : (
          <div className="gallery-grid">
            {images.length === 0 ? (
              <p className="no-content">No images available</p>
            ) : (
              images.map((img, index) => (
                <motion.div
                  key={img.image}
                  className="media-card-image"
                  initial={{ opacity: 0, y: 0 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 1, y: -50 }}
                  transition={{ duration: 1 }}
                  onClick={() => handleImageClick(img)}
                >
                  <Image
                    src={img.image}
                    alt={`Image ${index + 1}`}
                    width={800}
                    height={600}
                    quality={100}
                    className="media-thumbnail"
                    loading={index > 5 ? "lazy" : "eager"}
                    priority={index <= 3}
                    style={{ objectFit: "contain" }}
                    onError={() => console.error(`Failed to load: ${img.image}`)}
                  />
                </motion.div>
              ))
            )}
            {hasMore && (
              <div ref={loadMoreRef} className="load-more"></div>
            )}
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default Gallery;