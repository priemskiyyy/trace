export const createPendingUploads = () => {
  const uploads = new Set<Promise<{ code: number }>>();

  return {
    add: (upload: Promise<{ code: number }>) => {
      const handleSettled = () => {
        uploads.delete(upload);
      };

      uploads.add(upload);
      upload.then(handleSettled, handleSettled);
    },
    values: () => [...uploads],
  };
};
