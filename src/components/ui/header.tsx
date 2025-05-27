/**
 * Header component for the video gallery, encapsulating the title, search input, and control buttons.
 * Uses CSS variables from globals.css for UI configuration.
 * Provides search, filter, refresh, and navigation functionality.
 *
 * @module components/ui/header
 * @requires react
 * @requires next/image
 * @requires @/components/ui/services
 * @requires @/components/ui/button
 * @requires next/link
 */

import React from 'react';
import Image from 'next/image';
import Services from '@/components/ui/services';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface HeaderProps {
  search: string;
  filter: 'all' | 'mp4' | 'webm';
  onSearchChange: (value: string) => void;
  onFilterChange: (value: 'all' | 'mp4' | 'webm') => void;
  onRefresh: () => void;
}

// eslint-disable-next-line react/display-name
const Header: React.FC<HeaderProps> = React.memo(({ search, filter, onSearchChange, onFilterChange, onRefresh }) => {
  return (
    <header className="h-max transition-all delay-500 sticky top-0 z-10 w-full text-center bg-black bg-opacity-80">
      <h2 className="text-2xl font-bold text-white py-2">
        Videos
        <span className="inline-block ml-2">
          <Image src="/thumbnails/preview/loader.gif" alt="Loading" width={20} height={20} style={{ opacity: 'var(--loader-visible)' }} />
        </span>
      </h2>
      <div className="flex flex-col items-center gap-2 pb-2">
        <input
          type="text"
          placeholder="Search videos or tags..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="b1 bg-transparent text-white border-white border-opacity-50 rounded px-2 py-1 w-[80vw]"
        />
        <div className="flex justify-center gap-2">
          <Button variant="outline" className="nav-button animate-pulse" onClick={onRefresh}>
            Refresh
          </Button>
          <select
            className="nav-button bg-transparent text-white border-white border-opacity-50 rounded px-2"
            value={filter}
            onChange={(e) => onFilterChange(e.target.value as 'all' | 'mp4' | 'webm')}
          >
            <option value="all">All</option>
            <option value="mp4">MP4</option>
            <option value="webm">WebM</option>
          </select>
          <Button variant="outline" className="nav-button animate-pulse">
            <Link href="/settings" className="nav-button text-white hover:underline hover:animate-pulse">
              Settings
            </Link>
          </Button>
          <div className="fixed right-0 left-0 justify-center place-content-center-safe bottom-10 self-center z-10">
            <Services />
            
          </div>
        </div>
      </div>
    </header>
  );
});

export default Header;