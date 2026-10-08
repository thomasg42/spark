"use client";
import {useEffect} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
/** Replaces old bookmarks without adding a back-navigation loop. */
export function LegacyRoute({href}:{href:string}){const router=useRouter();useEffect(()=>{router.replace(href+window.location.search);},[href,router]);return <p>Opening your page… <Link href={href}>Continue</Link></p>;}
