import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { motion } from "motion/react";

interface WhatsAppQRCodeProps {
  qrData?: string;
  size?: number;
}

export function WhatsAppQRCode({ 
  qrData = "https://wa.me/example", 
  size = 320 
}: WhatsAppQRCodeProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="flex flex-col items-center gap-4">
      {/* QR Code Container with Pulse Animation */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="relative"
      >
        {/* Pulse Border Animation */}
        <motion.div
          animate={{
            scale: [1, 1.05, 1],
            opacity: [0.5, 0.8, 0.5],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute inset-0 rounded-2xl bg-gradient-to-br from-green-400 to-green-600 blur-lg"
          style={{ zIndex: -1 }}
        />

        {/* QR Code with White Background */}
        <div className="relative bg-white p-6 rounded-2xl shadow-2xl">
          <QRCodeSVG
            value={qrData}
            size={size}
            level="H"
            includeMargin={false}
            style={{ display: "block" }}
          />

          {/* WhatsApp Logo Overlay in Center */}
          <div 
            className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-full p-2 shadow-lg"
            style={{ width: size * 0.2, height: size * 0.2 }}
          >
            <div 
              className="w-full h-full rounded-full bg-[#25D366] flex items-center justify-center"
            >
              {/* WhatsApp Icon SVG */}
              <svg
                viewBox="0 0 24 24"
                className="w-3/5 h-3/5"
                fill="white"
              >
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
              </svg>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Helper Instructions */}
      <div className="text-center max-w-md">
        <p className="text-sm text-gray-600 font-medium mb-2">
          Scan this QR code with WhatsApp
        </p>
        <div className="text-xs text-gray-500 space-y-1">
          <p>1. Open WhatsApp on your phone</p>
          <p>2. Tap <span className="font-semibold">Menu</span> or <span className="font-semibold">Settings</span></p>
          <p>3. Select <span className="font-semibold">Linked Devices</span></p>
          <p>4. Tap <span className="font-semibold">Link a Device</span></p>
          <p>5. Point your phone at this screen to scan the QR code</p>
        </div>
      </div>
    </div>
  );
}
