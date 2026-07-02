import React from "react";
import XTermTerminal from "../../Component/Terminal";
import { Box } from "../../Component/Primitives";
import { createRoot } from "react-dom/client";
import "../../style/index.css";
import "../../I18n";

const App: React.FC = () => {
  return (
    <Box className="flex h-dvh min-h-[600px] flex-col bg-[#0b1020] p-6 text-white">
      <XTermTerminal height="100%" />
    </Box>
  );
};

const container = document.getElementById("root");
const root = createRoot(container!);
root.render(<App />);
