import { useEffect, useState } from "react";
import type { AppData } from "../types";
import { loadAppData, saveAppData } from "../utils/storage";

export function usePersistentAppData(): [AppData, React.Dispatch<React.SetStateAction<AppData>>] {
  const [data, setData] = useState<AppData>(() => loadAppData());

  useEffect(() => {
    saveAppData(data);
  }, [data]);

  return [data, setData];
}
