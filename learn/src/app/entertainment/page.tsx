'use client';
import dynamic from 'next/dynamic';
const EntertainmentMain = dynamic(() => import('./_components/EntertainmentMain'), { ssr: false });
export default function EntertainmentPage() { return <EntertainmentMain />; }
