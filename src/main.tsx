import React from 'react';
import {createRoot} from 'react-dom/client';
import {MotionConfig} from 'motion/react';
import Root from './Root';
import './styles.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><MotionConfig reducedMotion="user"><Root/></MotionConfig></React.StrictMode>);
