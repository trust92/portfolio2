/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Services page component with an API explorer Drawer.
 * Fetches data from /api/services on mount and allows custom API calls via input.
 * Displays JSON data with a copy button, styled in a compact monospace font.
 * JSON nodes are auto-expanded, with a large viewing window and tight text layout.
 *
 * @module app/services/page
 * @requires react
 * @requires @/components/ui/drawer
 * @requires @/components/ui/input
 * @requires @/components/ui/button
 * @requires @/globals.css
 */
"use client";
import React, { useState, useEffect, JSX } from 'react';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import '@/globals.css';

const Services: React.FC = () => {
  const [apiData, setApiData] = useState<any>(null);
  const [error, setError] = useState<string>('');
  const [pageTitle, setPageTitle] = useState<string>('videos');

  // Fetch API data
  const fetchApiData = async (title: string) => {
    try {
      const response = await fetch(`/api/${title}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
      const data = await response.json();
      setApiData(data);
      setError('');
      console.log(`\x1b[32mFetched /api/${title} successfully\x1b[0m`);
    } catch (err: any) {
      setError(`Failed to fetch /api/${title}: ${err.message}`);
      setApiData(null);
      console.error(`\x1b[31mError fetching /api/${title}: ${err.message}\x1b[0m`);
    }
  };

  // Initial fetch for /api/services
  useEffect(() => {
    fetchApiData('captions');
  }, []);

  // Handle input and Enter key
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPageTitle(e.target.value);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && pageTitle.trim()) {
      fetchApiData(pageTitle.trim());
    }
  };

  // Render JSON recursively
  const renderJson = (data: any, path: string = '', depth: number = 0): JSX.Element => {
    if (typeof data !== 'object' || data === null) {
      return <span className="text-white">{JSON.stringify(data)}</span>;
    }

    const isArray = Array.isArray(data);
    const keys = isArray ? data.map((_, i) => i.toString()) : Object.keys(data);

    return (
      <div className="ml-2" style={{ marginLeft: `${depth * 8}px` }}>
        <span className="text-blue-400">{isArray ? '[' : '{'}</span>
        <div>
          {keys.map((key, index) => {
            const newPath = path ? `${path}.${key}` : key;
            return (
              <div key={newPath} className="leading-[14px]">
                <span className="text-green-400">{key}</span>:&nbsp;
                {renderJson(data[key], newPath, depth + 1)}
                {index < keys.length - 1 ? ',' : ''}
              </div>
            );
          })}
        </div>
        <span className="text-blue-400">{isArray ? ']' : '}'}</span>
      </div>
    );
  };

  return (
    <div>
      <Drawer>
        <DrawerTrigger>
          API
        </DrawerTrigger>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>API</DrawerTitle>
            <DrawerDescription>
              <div className="text-left">
                <h2 className="text-sm mt-4">PATH</h2>
                <span className="flex s1 rounded-xl animate-pulse"><Button>/api/</Button><Input
                  type="text"
                  placeholder="Enter API page title (e.g., videos)"
                  value={pageTitle}
                  onChange={handleInputChange}
                  onKeyPress={handleKeyPress}
                  className="s1 cursor-text"
                /></span>
                <div className="detail overflow-y-scroll max-h-[80vh]">
                  <h2 className="text-sm">JSON DATA</h2>
                 <div className="s1">
                    <div className="border-0"><span>route: /api/{pageTitle}</span></div>
                  </div>
                  <h2 className="text-sm mt-4">DATA</h2>
                    <div className="bg-black/50 p-2 rounded text-[10px] font-mono text-white leading-[14px] relative max-h-[50vh]">
                    {error ? (
                      <div className="text-red-400">{error}</div>
                    ) : apiData ? (
                      <>{renderJson(apiData)}</>
                    ) : (
                      <div>Loading...</div>
                    )}
                  </div>
                </div>
              </div>
            </DrawerDescription>
          </DrawerHeader>
          <DrawerFooter>
            <DrawerClose>
                Close
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
};

export default Services;