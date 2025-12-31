import prisma from "../config/prisma.config.js";

// Clock-In Controllers
export const clockInGPS = (req, res) => {};

export const clockInWiFi = (req, res) => {};

export const clockInQRCode = (req, res) => {};

export const clockInPhoto = (req, res) => {};

// Clock-Out Controllers
export const clockOutGPS = (req, res) => {};

export const clockOutWiFi = (req, res) => {};

export const clockOutQRCode = (req, res) => {};

export const clockOutPhoto = (req, res) => {};

// Attendance History
export const getAttendanceHistory = (req, res) => {};

export const getMyAttendanceHistory = (req, res) => {};
