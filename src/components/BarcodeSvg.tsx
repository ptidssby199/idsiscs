import React, { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

interface BarcodeSvgProps {
  value: string;
  height?: number;
  fontSize?: number;
  displayValue?: boolean;
  margin?: number;
  width?: number;
}

export const BarcodeSvg: React.FC<BarcodeSvgProps> = ({
  value,
  height = 50,
  fontSize = 14,
  displayValue = true,
  margin = 0,
  width = 2
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (svgRef.current && value) {
      try {
        JsBarcode(svgRef.current, value, {
          format: 'CODE128',
          displayValue,
          fontSize,
          height,
          margin,
          width
        });
      } catch (err) {
        console.error('JsBarcode error:', err);
      }
    }
  }, [value, height, fontSize, displayValue, margin, width]);

  return <svg ref={svgRef} className="max-w-full" />;
};
