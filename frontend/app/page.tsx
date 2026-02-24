"use client";
import React from 'react';
import HeroSection from '@/Landingpage/main';
import TaskManagementSection from '@/Landingpage/taskmanager';
import FeaturesSection from '@/Landingpage/features';
import AnimatedHero from '@/Landingpage/nomissing';
import WorkflowsSection from '@/Landingpage/workflow';
import FeaturesSectionRight from '@/Landingpage/feature2';
import ComparisonSection from '@/Landingpage/compare';

export default function App() {
  return (
    <div>
      <section id="hero">
        <HeroSection />
      </section>
      <section id="features">
        <FeaturesSection />
      </section>
      <section id="features">
        <FeaturesSectionRight />
      </section>
      <section id="tasks">
        <TaskManagementSection />
      </section>
      <AnimatedHero />
      <section id="workflow">
        <WorkflowsSection />
      </section>
      <section id="comparison">
        <ComparisonSection/>
      </section>
    </div>
  );
}
