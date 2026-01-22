'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import {
  Book, ChevronRight, ChevronDown, BookOpen,
  Code, MessageSquare, Zap, Shield, Check, X, Play,
  FileText, Target, Users, Star, ArrowRight, MapPin
} from 'lucide-react';

// ============================================================================
// SCROLL ANIMATION HOOK
// ============================================================================

function useScrollAnimation(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          // Once visible, stop observing to prevent re-triggering
          if (ref.current) {
            observer.unobserve(ref.current);
          }
        }
      },
      { threshold, rootMargin: '0px 0px -50px 0px' }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => {
      if (ref.current) {
        observer.unobserve(ref.current);
      }
    };
  }, [threshold]);

  return { ref, isVisible };
}

// Parallax effect hook
function useParallax() {
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return scrollY;
}

// ============================================================================
// TYPES
// ============================================================================

interface FAQItem {
  question: string;
  answer: string;
}

interface Testimonial {
  quote: string;
  author: string;
  role: string;
}

interface ComparisonRow {
  feature: string;
  learningCompanion: boolean | string;
  genericAI: boolean | string;
}

// ============================================================================
// DATA
// ============================================================================

const testimonials: Testimonial[] = [
  {
    quote: "I turned my 60-page Bar Exam syllabus into a 20-day journey. I actually finished 3 days early.",
    author: "Sarah J.",
    role: "Law Student"
  },
  {
    quote: "The Code Sandbox inside the lesson is a game-changer. I stopped watching tutorials and started building.",
    author: "Kevin M.",
    role: "Self-Taught Dev"
  },
  {
    quote: "Finally, an AI that understands I already know the basics. It jumped me straight to advanced React patterns.",
    author: "Priya K.",
    role: "Frontend Engineer"
  }
];

const comparisonData: ComparisonRow[] = [
  { feature: "Structured Learning Path", learningCompanion: true, genericAI: false },
  { feature: "Remembers Your Progress (SRS)", learningCompanion: true, genericAI: false },
  { feature: "Integrated Code Sandbox", learningCompanion: true, genericAI: false },
  { feature: "Syllabus Parsing", learningCompanion: true, genericAI: false },
  { feature: "Adaptive Difficulty", learningCompanion: true, genericAI: "Limited" },
  { feature: "Visual Journey Map", learningCompanion: true, genericAI: false },
];

const faqData: FAQItem[] = [
  {
    question: "How is the journey 'personalized'?",
    answer: "We use a Multi-Agent system. Our Diagnostic Agent interviews you to find exactly what you're missing, so you never waste time on things you already understand."
  },
  {
    question: "Can I use this for coding?",
    answer: "Yes. We have an integrated Code Execution Sandbox. You can write and run Python/JS directly inside your learning nodes."
  },
  {
    question: "Is there a mobile app?",
    answer: "Our platform is mobile-first. You can review your SRS flashcards on the bus or check your roadmap in the library."
  },
  {
    question: "How does Syllabus Mode work?",
    answer: "Simply upload any PDF syllabus. Our AI strictly maps every module and topic into a 1:1 vertical roadmap. No fluff, just a clear checklist for your exam."
  },
  {
    question: "What subjects can I learn?",
    answer: "Anything! From programming languages to bar exams, from data science to music theory. Our AI adapts to any subject matter."
  }
];

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function StickyHeader({
  isScrolled,
  onGetStarted
}: {
  isScrolled: boolean;
  onGetStarted: () => void;
}) {
  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 sticky-header ${isScrolled ? 'scrolled' : ''}`}
    >
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Book className="w-7 h-7 text-indigo-400" />
          <span className="text-xl font-bold text-white">
            Learning Companion
          </span>
        </div>

        <button
          onClick={onGetStarted}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-full cta-primary flex items-center gap-2 text-sm"
        >
          Start Your Journey
          <ArrowRight className="w-4 h-4" />
        </button>
      </nav>
    </header>
  );
}

function HeroSection({
  onGetStarted,
  topicInput,
  setTopicInput,
  onTryNow
}: {
  onGetStarted: () => void;
  topicInput: string;
  setTopicInput: (v: string) => void;
  onTryNow: () => void;
}) {
  return (
    <section className="relative pt-32 pb-20 px-4 sm:px-6 lg:px-8 overflow-hidden">
      {/* Background gradient orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-purple-600/15 rounded-full blur-3xl" />
      </div>

      <div className="max-w-7xl mx-auto relative">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left: Copy */}
          <div className="text-center lg:text-left">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6 animate-fade-in-up">
              Master Any Subject in{' '}
              <span className="text-gradient">1/3 the Time</span>
              —Personalized by AI.
            </h1>

            <p className="text-lg sm:text-xl text-gray-400 mb-8 max-w-xl mx-auto lg:mx-0 animate-fade-in-up delay-100" style={{ opacity: 0 }}>
              Stop drowning in syllabi. Whether you're prepping for finals or picking up Python,
              Learning Companion architects a step-by-step roadmap tailored to your specific knowledge gaps.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start mb-4 animate-fade-in-up delay-200" style={{ opacity: 0 }}>
              <button
                onClick={onGetStarted}
                className="px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl cta-primary animate-pulse-cta flex items-center justify-center gap-2 text-lg"
              >
                Start Your Journey — Free
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-gray-500 animate-fade-in-up delay-300" style={{ opacity: 0 }}>
              No credit card required. Setup in 30 seconds.
            </p>

            {/* Try it now input */}
            <div className="mt-8 animate-fade-in-up delay-400" style={{ opacity: 0 }}>
              <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto lg:mx-0">
                <input
                  type="text"
                  placeholder="What do you want to learn? (e.g., React, Bar Exam)"
                  value={topicInput}
                  onChange={(e) => setTopicInput(e.target.value)}
                  className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20"
                  onKeyDown={(e) => e.key === 'Enter' && onTryNow()}
                />
                <button
                  onClick={onTryNow}
                  className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white font-medium rounded-xl border border-white/10 hover:border-white/20 transition-all flex items-center justify-center gap-2"
                >
                  Try Now
                  <Zap className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Right: Split-screen visual */}
          <div className="relative animate-fade-in-up delay-200" style={{ opacity: 0 }}>
            <div className="grid grid-cols-2 gap-4">
              {/* Chaotic PDF side */}
              <div className="relative">
                <div className="absolute -top-2 left-4 px-3 py-1 bg-red-500/20 text-red-400 text-xs font-medium rounded-full border border-red-500/30">
                  Before
                </div>
                <div className="chaos-document bg-gray-800/50 rounded-xl p-4 border border-gray-700/50 h-64 overflow-hidden">
                  <div className="space-y-2 opacity-60">
                    {[...Array(12)].map((_, i) => (
                      <div
                        key={i}
                        className="h-2 bg-gray-600/50 rounded"
                        style={{ width: `${60 + Math.random() * 40}%` }}
                      />
                    ))}
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="bg-gray-900/90 px-4 py-2 rounded-lg text-gray-400 text-sm italic">
                      "Where do I even start?"
                    </div>
                  </div>
                </div>
              </div>

              {/* Journey Map side */}
              <div className="relative">
                <div className="absolute -top-2 right-4 px-3 py-1 bg-green-500/20 text-green-400 text-xs font-medium rounded-full border border-green-500/30">
                  After
                </div>
                <div className="journey-map-glow bg-indigo-900/30 rounded-xl p-4 border border-indigo-500/30 h-64">
                  <div className="flex flex-col items-center gap-3 pt-4">
                    {/* Journey nodes */}
                    <div className="w-10 h-10 bg-indigo-500 rounded-lg flex items-center justify-center animate-glow">
                      <Target className="w-5 h-5 text-white" />
                    </div>
                    <div className="w-0.5 h-4 bg-indigo-500/50" />
                    <div className="w-8 h-8 bg-indigo-600/50 rounded-lg flex items-center justify-center border-2 border-dashed border-indigo-400/50">
                      <BookOpen className="w-4 h-4 text-indigo-300" />
                    </div>
                    <div className="w-0.5 h-4 bg-indigo-500/30" />
                    <div className="w-8 h-8 bg-gray-700/50 rounded-lg flex items-center justify-center border border-gray-600/50">
                      <Code className="w-4 h-4 text-gray-500" />
                    </div>
                    <div className="w-0.5 h-4 bg-gray-600/30" />
                    <button className="px-4 py-2 bg-indigo-500 text-white text-sm font-medium rounded-lg animate-pulse-cta">
                      Begin
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProblemSection() {
  const { ref: sectionRef, isVisible } = useScrollAnimation(0.2);

  return (
    <section
      ref={sectionRef}
      className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-transparent to-indigo-950/20 animated-bg"
    >
      <div className="max-w-4xl mx-auto text-center">
        <h2 className={`text-3xl sm:text-4xl font-bold text-white mb-4 scroll-fade-up ${isVisible ? 'visible' : ''}`}>
          The Old Way of Learning is <span className="text-red-400 animate-text-glow">Broken</span>.
        </h2>

        <p className={`text-xl text-indigo-300 mb-8 scroll-fade-up stagger-1 ${isVisible ? 'visible' : ''}`}>
          You aren't lazy; you're <em>overwhelmed</em>.
        </p>

        <div className={`bg-white/5 rounded-2xl p-8 border border-white/10 mb-8 scroll-scale-up stagger-2 card-3d ${isVisible ? 'visible' : ''}`}>
          <p className="text-gray-300 text-lg leading-relaxed">
            Traditional syllabi are just <strong className="text-white">"data dumps."</strong> They don't account for
            what you already know or how you actually retain info. This leads to{' '}
            <strong className="text-amber-400">"Study Paralysis"</strong>—where you spend more time
            planning than actually learning.
          </p>
        </div>

        <div className={`flex items-center justify-center gap-2 text-indigo-400 font-medium scroll-fade-up stagger-3 ${isVisible ? 'visible' : ''}`}>
          <MapPin className="w-5 h-5 icon-bounce" />
          <span>Stop staring at page 1. Let AI build the bridge to the finish line.</span>
        </div>
      </div>
    </section>
  );
}

function SolutionSection({ mode, setMode }: { mode: 'syllabus' | 'topic'; setMode: (m: 'syllabus' | 'topic') => void }) {
  const { ref: sectionRef, isVisible } = useScrollAnimation(0.15);

  return (
    <section ref={sectionRef} className="py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className={`text-3xl sm:text-4xl font-bold text-white mb-4 scroll-fade-up ${isVisible ? 'visible' : ''}`}>
            Your <span className="text-gradient animate-gradient-shift">Personalized</span> Learning Architect
          </h2>
          <p className={`text-xl text-gray-400 scroll-fade-up stagger-1 ${isVisible ? 'visible' : ''}`}>
            Choose your starting point.
          </p>
        </div>

        {/* Toggle Switch */}
        <div className={`flex justify-center mb-12 scroll-scale-up stagger-2 ${isVisible ? 'visible' : ''}`}>
          <div className="inline-flex bg-white/5 rounded-full p-1 border border-white/10 animate-subtle-glow">
            <button
              onClick={() => setMode('syllabus')}
              className={`px-6 py-3 rounded-full font-medium transition-all btn-magnetic ${mode === 'syllabus'
                ? 'bg-indigo-600 text-white'
                : 'text-gray-400 hover:text-white'
                }`}
            >
              <FileText className="w-4 h-4 inline mr-2" />
              Syllabus Mode
            </button>
            <button
              onClick={() => setMode('topic')}
              className={`px-6 py-3 rounded-full font-medium transition-all btn-magnetic ${mode === 'topic'
                ? 'bg-indigo-600 text-white'
                : 'text-gray-400 hover:text-white'
                }`}
            >
              <MessageSquare className="w-4 h-4 inline mr-2" />
              Topic Mode
            </button>
          </div>
        </div>

        {/* Feature Cards */}
        <div className="grid md:grid-cols-2 gap-8">
          {/* Syllabus Mode Card */}
          <div
            className={`feature-card card-3d bg-white/5 rounded-2xl p-8 border scroll-fade-left stagger-3 ${isVisible ? 'visible' : ''} ${mode === 'syllabus'
              ? 'border-indigo-500/50 ring-2 ring-indigo-500/20 animate-subtle-glow'
              : 'border-white/10'
              }`}
          >
            <div className="w-14 h-14 bg-indigo-500/20 rounded-xl flex items-center justify-center mb-6 icon-bounce">
              <FileText className="w-7 h-7 text-indigo-400" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">
              Syllabus Mode
            </h3>
            <p className="text-indigo-300 text-sm mb-4 font-medium">
              The Strict Parser
            </p>
            <p className="text-gray-400">
              Upload any PDF. Our AI strictly maps every module and topic into a 1:1 vertical roadmap.
              No fluff, just a clear checklist for your exam.
            </p>
            {mode === 'syllabus' && (
              <div className="mt-6 p-4 bg-indigo-950/50 rounded-xl border border-indigo-500/20 animate-fade-in-up">
                <div className="flex items-center gap-3 text-sm text-indigo-300">
                  <FileText className="w-5 h-5" />
                  <span>PDF → Vertical Roadmap</span>
                  <ArrowRight className="w-4 h-4" />
                  <span className="text-indigo-400 font-medium">Exam Ready</span>
                </div>
              </div>
            )}
          </div>

          {/* Topic Mode Card */}
          <div
            className={`feature-card card-3d bg-white/5 rounded-2xl p-8 border scroll-fade-right stagger-4 ${isVisible ? 'visible' : ''} ${mode === 'topic'
              ? 'border-purple-500/50 ring-2 ring-purple-500/20 animate-subtle-glow'
              : 'border-white/10'
              }`}
          >
            <div className="w-14 h-14 bg-purple-500/20 rounded-xl flex items-center justify-center mb-6 icon-bounce">
              <Book className="w-7 h-7 text-purple-400" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">
              Topic Mode
            </h3>
            <p className="text-purple-300 text-sm mb-4 font-medium">
              The Adaptive Mentor
            </p>
            <p className="text-gray-400">
              Want to learn something new? Chat with our Diagnostic Agent for 2 minutes.
              We'll find your gaps and build a journey that skips what you already know.
            </p>
            {mode === 'topic' && (
              <div className="mt-6 p-4 bg-purple-950/50 rounded-xl border border-purple-500/20 animate-fade-in-up">
                <div className="flex items-center gap-3 text-sm text-purple-300">
                  <MessageSquare className="w-5 h-5" />
                  <span>2-min Chat</span>
                  <ArrowRight className="w-4 h-4" />
                  <span className="text-purple-400 font-medium">Custom Path</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function SocialProofSection() {
  const { ref: sectionRef, isVisible } = useScrollAnimation(0.1);
  const { ref: statsRef, isVisible: statsVisible } = useScrollAnimation(0.2);
  const { ref: testimonialsRef, isVisible: testimonialsVisible } = useScrollAnimation(0.1);

  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-indigo-950/20 to-transparent">
      <div className="max-w-6xl mx-auto">
        <div ref={sectionRef} className="text-center mb-12">
          <div className={`flex items-center justify-center gap-2 mb-4 scroll-fade-down ${isVisible ? 'visible' : ''}`}>
            <Users className="w-6 h-6 text-indigo-400 icon-wiggle" />
            <span className="text-indigo-400 font-medium">Trusted by learners worldwide</span>
          </div>
          <h2 className={`text-3xl sm:text-4xl font-bold text-white scroll-blur-in stagger-1 ${isVisible ? 'visible' : ''}`}>
            Joined by <span className="text-gradient animate-text-glow">50,000+</span> Lifelong Learners
          </h2>
        </div>

        {/* Stats */}
        <div ref={statsRef} className="grid grid-cols-3 gap-8 mb-16 max-w-3xl mx-auto">
          <div className={`text-center scroll-zoom-fade stagger-1 ${statsVisible ? 'visible' : ''}`}>
            <div className="text-3xl sm:text-4xl font-bold text-white mb-2 stat-number">50K+</div>
            <div className="text-gray-500 text-sm">Active Learners</div>
          </div>
          <div className={`text-center scroll-zoom-fade stagger-2 ${statsVisible ? 'visible' : ''}`}>
            <div className="text-3xl sm:text-4xl font-bold text-white mb-2 stat-number">1M+</div>
            <div className="text-gray-500 text-sm">Lessons Completed</div>
          </div>
          <div className={`text-center scroll-zoom-fade stagger-3 ${statsVisible ? 'visible' : ''}`}>
            <div className="text-3xl sm:text-4xl font-bold text-white mb-2 stat-number">4.9</div>
            <div className="text-gray-500 text-sm flex items-center justify-center gap-1">
              <Star className="w-4 h-4 text-amber-400 fill-amber-400 icon-wiggle" />
              Rating
            </div>
          </div>
        </div>

        {/* Testimonials */}
        <div ref={testimonialsRef} className="grid md:grid-cols-3 gap-6">
          {testimonials.map((testimonial, index) => (
            <div
              key={index}
              className={`testimonial-card rounded-2xl p-6 border border-white/10 scroll-bounce-up stagger-${index + 1} ${testimonialsVisible ? 'visible' : ''}`}
            >
              <div className="flex gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-4 h-4 text-amber-400 fill-amber-400" style={{ animationDelay: `${i * 0.1}s` }} />
                ))}
              </div>
              <p className="text-gray-300 mb-6 leading-relaxed">
                "{testimonial.quote}"
              </p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-500/20 rounded-full flex items-center justify-center animate-pulse-scale">
                  <span className="text-indigo-400 font-medium">
                    {testimonial.author[0]}
                  </span>
                </div>
                <div>
                  <div className="text-white font-medium">{testimonial.author}</div>
                  <div className="text-gray-500 text-sm">{testimonial.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function DifferentiationSection() {
  const { ref: sectionRef, isVisible } = useScrollAnimation(0.1);
  const { ref: cardsRef, isVisible: cardsVisible } = useScrollAnimation(0.15);
  const { ref: tableRef, isVisible: tableVisible } = useScrollAnimation(0.1);

  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8 animated-bg">
      <div className="max-w-4xl mx-auto">
        <div ref={sectionRef} className="text-center mb-12">
          <h2 className={`text-3xl sm:text-4xl font-bold text-white mb-4 scroll-fade-up ${isVisible ? 'visible' : ''}`}>
            Not Just Another Chatbot.
          </h2>
          <p className={`text-xl text-gray-400 scroll-fade-up stagger-1 ${isVisible ? 'visible' : ''}`}>
            An Entire <span className="text-indigo-400 animate-text-glow">Ecosystem</span>.
          </p>
        </div>

        {/* Key differentiators */}
        <div ref={cardsRef} className="grid md:grid-cols-3 gap-6 mb-12">
          <div className={`bg-white/5 rounded-xl p-6 border border-white/10 text-center card-3d scroll-flip-y stagger-1 ${cardsVisible ? 'visible' : ''}`}>
            <div className="w-12 h-12 bg-indigo-500/20 rounded-xl flex items-center justify-center mx-auto mb-4 icon-spin">
              <Target className="w-6 h-6 text-indigo-400" />
            </div>
            <p className="text-gray-300">
              ChatGPT gives <span className="text-gray-500">answers</span>;
            </p>
            <p className="text-white font-medium">
              we give <span className="text-indigo-400">Structure</span>.
            </p>
          </div>
          <div className={`bg-white/5 rounded-xl p-6 border border-white/10 text-center card-3d scroll-flip-y stagger-2 ${cardsVisible ? 'visible' : ''}`}>
            <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center mx-auto mb-4 icon-spin">
              <Book className="w-6 h-6 text-purple-400" />
            </div>
            <p className="text-gray-300">
              Generic AI <span className="text-gray-500">forgets</span>;
            </p>
            <p className="text-white font-medium">
              our SRS Agent <span className="text-purple-400">remembers</span>.
            </p>
          </div>
          <div className={`bg-white/5 rounded-xl p-6 border border-white/10 text-center card-3d scroll-flip-y stagger-3 ${cardsVisible ? 'visible' : ''}`}>
            <div className="w-12 h-12 bg-amber-500/20 rounded-xl flex items-center justify-center mx-auto mb-4 icon-spin">
              <Code className="w-6 h-6 text-amber-400" />
            </div>
            <p className="text-gray-300">
              Textbooks are <span className="text-gray-500">passive</span>;
            </p>
            <p className="text-white font-medium">
              our Sandbox is <span className="text-amber-400">active</span>.
            </p>
          </div>
        </div>

        {/* Comparison Table */}
        <div ref={tableRef} className={`overflow-x-auto scroll-scale-up ${tableVisible ? 'visible' : ''}`}>
          <table className="w-full comparison-table">
            <thead>
              <tr>
                <th className="text-left py-4 px-4 text-gray-400 font-medium">Feature</th>
                <th className="py-4 px-4 text-indigo-400 font-medium">Learning Companion</th>
                <th className="py-4 px-4 text-gray-500 font-medium">Generic AI</th>
              </tr>
            </thead>
            <tbody>
              {comparisonData.map((row, index) => (
                <tr key={index} className="hover:bg-white/5 transition-colors">
                  <td className="py-4 px-4 text-gray-300">{row.feature}</td>
                  <td className="py-4 px-4 text-center">
                    {row.learningCompanion === true ? (
                      <Check className="w-5 h-5 text-green-400 mx-auto icon-bounce" />
                    ) : (
                      <span className="text-gray-400">{row.learningCompanion}</span>
                    )}
                  </td>
                  <td className="py-4 px-4 text-center">
                    {row.genericAI === false ? (
                      <X className="w-5 h-5 text-red-400 mx-auto" />
                    ) : (
                      <span className="text-gray-500">{row.genericAI}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className={`text-center text-gray-400 mt-8 scroll-fade-up stagger-4 ${tableVisible ? 'visible' : ''}`}>
          We don't just answer your questions. We build the environment where you actually{' '}
          <span className="text-white font-medium">master the skill</span>.
        </p>
      </div>
    </section>
  );
}

function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const { ref: sectionRef, isVisible } = useScrollAnimation(0.1);
  const { ref: faqRef, isVisible: faqVisible } = useScrollAnimation(0.1);

  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-transparent to-indigo-950/20">
      <div className="max-w-3xl mx-auto">
        <div ref={sectionRef} className="text-center mb-12">
          <h2 className={`text-3xl sm:text-4xl font-bold text-white mb-4 scroll-blur-in ${isVisible ? 'visible' : ''}`}>
            Frequently Asked Questions
          </h2>
          <p className={`text-gray-400 scroll-fade-up stagger-1 ${isVisible ? 'visible' : ''}`}>
            Everything you need to know about Learning Companion.
          </p>
        </div>

        <div ref={faqRef} className="space-y-4">
          {faqData.map((item, index) => (
            <div
              key={index}
              className={`bg-white/5 rounded-xl border border-white/10 overflow-hidden card-glow-hover scroll-fade-left stagger-${Math.min(index + 1, 6)} ${faqVisible ? 'visible' : ''}`}
            >
              <button
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                className="w-full px-6 py-5 flex items-center justify-between text-left hover:bg-white/5 transition-colors"
              >
                <span className="text-white font-medium pr-4">{item.question}</span>
                <ChevronDown
                  className={`w-5 h-5 text-indigo-400 flex-shrink-0 accordion-arrow ${openIndex === index ? 'rotated' : ''
                    }`}
                />
              </button>
              <div
                className={`accordion-content ${openIndex === index ? 'expanded' : 'collapsed'}`}
              >
                <div className="px-6 pb-5 text-gray-400">
                  {item.answer}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCTASection({ onGetStarted }: { onGetStarted: () => void }) {
  const { ref: sectionRef, isVisible } = useScrollAnimation(0.2);
  const scrollY = useParallax();

  return (
    <section ref={sectionRef} className="py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className={`relative bg-gradient-to-br from-indigo-900/50 to-purple-900/50 rounded-3xl p-12 sm:p-16 border border-indigo-500/30 overflow-hidden animate-subtle-glow scroll-zoom-fade ${isVisible ? 'visible' : ''}`}>
          {/* Background effects with parallax */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div
              className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl hero-bg-orb"
              style={{ transform: `translateY(${scrollY * 0.05}px)` }}
            />
            <div
              className="absolute bottom-0 left-0 w-48 h-48 bg-purple-500/20 rounded-full blur-3xl hero-bg-orb"
              style={{ transform: `translateY(${-scrollY * 0.03}px)` }}
            />
          </div>

          <div className="relative text-center">
            <h2 className={`text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4 scroll-fade-up stagger-1 ${isVisible ? 'visible' : ''}`}>
              Stop Studying. Start <span className="text-gradient animate-gradient-shift">Mastering</span>.
            </h2>

            <p className={`text-xl text-indigo-200 mb-10 max-w-2xl mx-auto scroll-fade-up stagger-2 ${isVisible ? 'visible' : ''}`}>
              Your first Journey Map is ready to be built. Where are we going today?
            </p>

            <div className={`flex flex-col sm:flex-row gap-4 justify-center items-center scroll-bounce-up stagger-3 ${isVisible ? 'visible' : ''}`}>
              <button
                onClick={onGetStarted}
                className="px-10 py-5 bg-white text-indigo-900 font-bold rounded-xl hover:bg-indigo-100 transition-all hover:shadow-lg hover:shadow-white/20 flex items-center gap-2 text-lg btn-magnetic btn-pulse"
              >
                Create My Journey Map
                <ArrowRight className="w-5 h-5" />
              </button>

              <button className="px-6 py-3 text-indigo-300 hover:text-white font-medium flex items-center gap-2 transition-colors btn-magnetic">
                <Play className="w-5 h-5 icon-wiggle" />
                Watch 30-sec Demo
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="py-12 px-4 sm:px-6 lg:px-8 border-t border-white/10">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <Book className="w-6 h-6 text-indigo-400" />
            <span className="text-white font-medium">Learning Companion</span>
          </div>

          <div className="text-gray-500 text-sm">
            © 2024 Learning Companion. Built for learners, by learners.
          </div>

          <div className="flex items-center gap-6">
            <a href="#" className="text-gray-400 hover:text-white text-sm transition-colors">Privacy</a>
            <a href="#" className="text-gray-400 hover:text-white text-sm transition-colors">Terms</a>
            <a href="#" className="text-gray-400 hover:text-white text-sm transition-colors">Contact</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function LandingPage() {
  const router = useRouter();
  const { user, loading, signInWithGoogle } = useAuth();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mode, setMode] = useState<'syllabus' | 'topic'>('topic');
  const [topicInput, setTopicInput] = useState('');

  // Redirect if already logged in
  useEffect(() => {
    if (!loading && user) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  // Track scroll for sticky header
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleGetStarted = async () => {
    const { user, error } = await signInWithGoogle();
    if (user) {
      router.push('/dashboard');
    } else if (error) {
      console.error('Sign in failed:', error);
    }
  };

  const handleTryNow = async () => {
    if (!topicInput.trim()) return;

    const { user, error } = await signInWithGoogle();
    if (user) {
      // Store topic for use after auth
      sessionStorage.setItem('pendingTopic', topicInput);
      router.push('/dashboard');
    } else if (error) {
      console.error('Sign in failed:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0015] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0015] text-white">
      <StickyHeader isScrolled={isScrolled} onGetStarted={handleGetStarted} />

      <main>
        <HeroSection
          onGetStarted={handleGetStarted}
          topicInput={topicInput}
          setTopicInput={setTopicInput}
          onTryNow={handleTryNow}
        />

        <div className="section-divider" />

        <ProblemSection />

        <div className="section-divider" />

        <SolutionSection mode={mode} setMode={setMode} />

        <div className="section-divider" />

        <SocialProofSection />

        <div className="section-divider" />

        <DifferentiationSection />

        <div className="section-divider" />

        <FAQSection />

        <FinalCTASection onGetStarted={handleGetStarted} />
      </main>

      <Footer />
    </div>
  );
}