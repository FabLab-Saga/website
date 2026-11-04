// Draft entries are visible only in the explicitly private preview build.
export const showDrafts = import.meta.env.BASE_URL !== '/' || import.meta.env.DEV;
export const visible = (entry: {data:{published:boolean}}) => entry.data.published || showDrafts;
export const slug = (id:string) => id.replace(/^is\//, '');
