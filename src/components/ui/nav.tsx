import React from 'react';
import '@/globals.css';
import { Button } from './button';
import Link from 'next/link';

const Nav = () => {
  return (
    <div className="m-1 pb-1 flex grid-rows-1 gap-1 top-0 text-center relative rounded-xl bg-transparent z-50">
      <Link href="/"><Button className="s1">Gallery</Button></Link>
      <Link href="/videos"><Button className="s1">Videos</Button></Link>
    </div>
  );
};

export default Nav;