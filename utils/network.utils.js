import { networkInterfaces } from "os";
export const getLocalIP = () => {
    const nets = networkInterfaces();
    const preferred = ["wifi", "wi-fi", "wlan", "wireless", "en0", "en1", "eth0", "ethernet"];
    for (const pref of preferred) {
      for (const name of Object.keys(nets)) {
        if (name.toLowerCase().includes(pref)) {
          for (const net of nets[name]) {
            if (net.family === "IPv4" && !net.internal) return net.address;
          }
        }
      }
    }
  
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === "IPv4" && !net.internal) return net.address;
      }
    }
  
    return "localhost";
  };
  