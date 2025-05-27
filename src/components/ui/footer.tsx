import React from 'react';
import '@/globals.css';
import Services from './services';

const Footer = () => {
  return (
        <div className="m-1 p-1 grid-cols-1 gap-1 top-bottom text-center relative rounded-xl bg-transparent z-50 self-center items-center justify-items-center">
              <br />
        <h3 className="footer-text">
          web design by datadrip-ai
          <br />
          developed for mobile screens
        </h3>
    <div className="w-[100vw] grid"><Services /></div>
    </div>
    
  );
};

export default Footer;