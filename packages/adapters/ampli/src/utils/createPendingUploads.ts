export const createPendingUploads = () => {
  const uploads = new Set<Promise<{ code: number } | void>>();

  return {
    add: (upload: Promise<{ code: number } | void>) => {
      const handleSettled = () => {
        uploads.delete(upload);
      };

      uploads.add(upload);
      upload.then(handleSettled, handleSettled);
    },
    values: () => [...uploads],
  };
};
