import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "../components/ui/button";
import { WhatsAppConnectionModal } from "../components/WhatsAppConnectionModal";

export function LandingPage() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div 
      className="min-h-screen flex flex-col items-center justify-center"
      style={{
        background: "linear-gradient(135deg, #F8F9FA 0%, #E3F2FD 100%)",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {/* Main Content */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="flex flex-col items-center justify-center text-center px-6 max-w-3xl"
      >
        {/* Logo/Brand */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.2 }}
          className="mb-8"
        >
          <div
            className="w-20 h-20 mx-auto flex items-center justify-center rounded-2xl shadow-xl"
            style={{
              background: "linear-gradient(135deg, #25D366 0%, #128C7E 100%)",
            }}
          >
            <MessageCircle size={40} color="#FFF" strokeWidth={2} />
          </div>
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-5xl md:text-6xl font-bold mb-6"
          style={{ color: "#1A1A2E", lineHeight: 1.2 }}
        >
          Connect Your
          <br />
          <span style={{ color: "#25D366" }}>WhatsApp Business</span>
        </motion.h1>

        {/* Subheadline */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-xl md:text-2xl text-gray-600 mb-12 max-w-2xl"
        >
          Turn your WhatsApp orders into organized invoices instantly.
          <br />
          Made for India's small businesses.
        </motion.p>

        {/* CTA Button */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.6, type: "spring", stiffness: 200 }}
        >
          <Button
            onClick={() => setModalOpen(true)}
            size="lg"
            className="text-lg px-8 py-7 rounded-xl shadow-2xl hover:shadow-xl transition-all duration-300"
            style={{
              backgroundColor: "#25D366",
              color: "#FFF",
              minWidth: "280px",
            }}
          >
            <MessageCircle className="w-6 h-6 mr-3" />
            Connect with WhatsApp
          </Button>
        </motion.div>

        {/* Trust Indicators */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-12 flex flex-wrap items-center justify-center gap-6 text-sm text-gray-500"
        >
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <span>Free to start</span>
          </div>
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <span>No credit card required</span>
          </div>
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <span>Setup in 2 minutes</span>
          </div>
        </motion.div>
      </motion.div>

      {/* WhatsApp Connection Modal */}
      <WhatsAppConnectionModal open={modalOpen} onOpenChange={setModalOpen} />
    </div>
  );
}
