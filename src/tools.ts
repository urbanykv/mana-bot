import { Usuario } from "./types/usuario";
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';


export function convertToUsuario(model: any): Usuario {
     return { nome: model.nome, numero: model.numero }; 
}

export function formatDateToBrazilian(date: string) {
    return format(date, 'dd/MM/yyyy', { locale: ptBR });
}